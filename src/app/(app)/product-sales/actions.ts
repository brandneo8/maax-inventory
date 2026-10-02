"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { singaporeToday } from "@/lib/format";
import { getCountShortfalls, type CountShortfall } from "@/lib/data/product-sales";
import { insertUsageLedgerRows, SALE_RECLASS_NOTE } from "@/lib/data/usage-ledger";

const REFERENCE_TABLE = "product_sale_items";

type Client = Awaited<ReturnType<typeof requireBranch>>["supabase"];

function revalidateProductSales(saleId?: string) {
  revalidatePath("/product-sales");
  revalidatePath("/home");
  revalidatePath("/home/products");
  revalidatePath("/orders");
  revalidatePath("/reports/monthly-inventory");
  if (saleId) revalidatePath(`/product-sales/${saleId}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ProductSaleLineInput = {
  product_id: string;
  quantity: number;
  unit_sale_price: number;
  /** The day this line sold — on or before the sale's own date. */
  sale_date: string;
  linked_count_txn_id?: string | null;
  linked_quantity?: number | null;
};

/** Every count shortfall at the current salon that still has a balance to clear. */
export async function getLinkableCountShortfalls() {
  const { supabase, companyId, branch } = await requireBranch();
  const shortfalls = await getCountShortfalls(supabase, companyId, branch.id, { allProducts: true });
  return shortfalls.filter((shortfall) => shortfall.remaining > 0);
}

/**
 * Removes every ledger row written for these sale lines (the retail_use
 * deductions and any reclassification rows) and replays each affected
 * product's cost — the cost trigger only fires on insert, so a delete has to
 * do this explicitly or the average stays computed against stock that's now
 * back on the shelf.
 */
async function removeSaleLedgerRows(supabase: Client, companyId: string, branchId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("inventory_transactions")
    .select("product_id")
    .eq("reference_table", REFERENCE_TABLE)
    .in("reference_id", itemIds);
  if (ledgerError) throw ledgerError;
  const affectedProductIds = [...new Set((ledgerRows ?? []).map((row) => row.product_id))];
  if (affectedProductIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("reference_table", REFERENCE_TABLE)
    .in("reference_id", itemIds);
  if (deleteError) throw deleteError;

  for (const productId of affectedProductIds) {
    const { error } = await supabase.rpc("fn_recompute_branch_cost", {
      p_company_id: companyId,
      p_product_id: productId,
      p_branch_id: branchId,
    });
    if (error) throw new Error(error.message || "Could not update product costs.");
  }
}

async function validateCountLinks(
  supabase: Client,
  companyId: string,
  branchId: string,
  lines: ProductSaleLineInput[],
): Promise<Map<string, CountShortfall>> {
  const linkedLines = lines.filter((line) => line.linked_count_txn_id);
  if (linkedLines.length === 0) return new Map();

  const txnIds = [...new Set(linkedLines.map((line) => line.linked_count_txn_id as string))];
  const shortfalls = await getCountShortfalls(supabase, companyId, branchId, { txnIds });
  const byTxn = new Map(shortfalls.map((shortfall) => [shortfall.txnId, shortfall]));

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, is_set")
    .eq("company_id", companyId)
    .in("id", [...new Set(linkedLines.map((line) => line.product_id))]);
  if (productsError) throw productsError;
  const bundleIds = new Set((products ?? []).filter((product) => product.is_set).map((product) => product.id));

  const requestedByTxn = new Map<string, number>();
  for (const line of linkedLines) {
    const txnId = line.linked_count_txn_id as string;
    const shortfall = byTxn.get(txnId);
    if (!shortfall) throw new Error("A linked count shortfall wasn't found at this salon, or its count was voided.");
    if (shortfall.productId !== line.product_id) throw new Error("A line is linked to a count shortfall for a different product.");
    if (bundleIds.has(line.product_id)) throw new Error("Bundle lines can't be linked to a count shortfall.");
    const applied = Number(line.linked_quantity);
    if (!Number.isFinite(applied) || applied <= 0 || applied > line.quantity) {
      throw new Error("An applied count quantity has to be more than 0 and no more than its line's quantity.");
    }
    requestedByTxn.set(txnId, (requestedByTxn.get(txnId) ?? 0) + applied);
  }
  for (const [txnId, requested] of requestedByTxn) {
    const shortfall = byTxn.get(txnId) as CountShortfall;
    if (requested > shortfall.remaining) {
      throw new Error(
        `A count reduction only has ${shortfall.remaining} unit${shortfall.remaining === 1 ? "" : "s"} left to clear — undo and re-apply it.`,
      );
    }
  }
  return byTxn;
}

export async function recordProductSale(input: {
  branch_id: string;
  sale_date: string;
  notes: string;
  lines: ProductSaleLineInput[];
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "record product sales");
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  const today = singaporeToday();
  if (!ISO_DATE.test(input.sale_date)) throw new Error("Enter a valid sale date.");
  if (input.sale_date > today) throw new Error("The sale date can't be after today.");

  const lines = input.lines.filter((line) => line.product_id && line.quantity > 0);
  if (lines.length === 0) throw new Error("Add at least one product with a quantity.");
  for (const line of lines) {
    if (!Number.isFinite(line.unit_sale_price) || line.unit_sale_price < 0) {
      throw new Error("Each line needs a unit price of 0 or more.");
    }
    if (!ISO_DATE.test(line.sale_date)) throw new Error("Each line needs a valid date sold.");
    if (line.sale_date > input.sale_date) throw new Error("A line's date sold can't be after the sale date.");
  }
  const shortfallByTxn = await validateCountLinks(supabase, companyId, branch.id, lines);

  const storeLocationId = await getDefaultStoreLocationId(supabase, branch.id);
  const notes = input.notes.trim() || null;

  const { data: sale, error: saleError } = await supabase
    .from("product_sales")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      sale_date: input.sale_date,
      notes,
      keyed_in_by: user.email,
    })
    .select("id")
    .single();
  if (saleError || !sale) throw saleError ?? new Error("Could not create the product sale.");

  const items = lines.map((line) => ({ ...line, itemId: randomUUID() }));
  const { error: itemsError } = await supabase.from("product_sale_items").insert(
    items.map((item) => ({
      id: item.itemId,
      product_sale_id: sale.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_sale_price: item.unit_sale_price,
      sale_date: item.sale_date,
      linked_count_txn_id: item.linked_count_txn_id || null,
      linked_quantity: item.linked_count_txn_id ? Number(item.linked_quantity) : null,
    })),
  );
  if (itemsError) {
    await supabase.from("product_sales").delete().eq("id", sale.id);
    throw itemsError;
  }

  try {
    await insertUsageLedgerRows(supabase, {
      companyId,
      branchId: branch.id,
      storeLocationId,
      userEmail: user.email,
      // POS sales are the one place retail_use comes from — Pulse's own
      // stock-out writes inhouse_use instead.
      txnType: "retail_use",
      classification: "retail",
      referenceTable: REFERENCE_TABLE,
      baseNote: notes ?? "Product sale (POS)",
      lines: items.map((item) => ({
        referenceId: item.itemId,
        productId: item.product_id,
        quantity: item.quantity,
        entryDate: item.sale_date,
      })),
    });

    // The applied part of a linked line was already deducted by the count it's
    // linked to (recorded as a shortfall), so add that much back on the
    // count's own date — the sale deduction above then replaces it. Stock
    // only drops by the unapplied remainder; the applied cost moves from
    // count shortfall to retail.
    const reclassRows = items.flatMap((item) => {
      const shortfall = item.linked_count_txn_id ? shortfallByTxn.get(item.linked_count_txn_id) : undefined;
      if (!shortfall) return [];
      return [
        {
          company_id: companyId,
          product_id: item.product_id,
          store_location_id: shortfall.storeLocationId,
          txn_type: "count_adjustment" as const,
          quantity_change: Number(item.linked_quantity),
          reference_table: REFERENCE_TABLE,
          reference_id: item.itemId,
          created_by: user.email,
          notes: SALE_RECLASS_NOTE,
          unit_cost: shortfall.unitCost,
          txn_date: shortfall.txnDate,
        },
      ];
    });
    if (reclassRows.length > 0) {
      const { error: reclassError } = await supabase.from("inventory_transactions").insert(reclassRows);
      if (reclassError) throw reclassError;
    }
  } catch (err) {
    await removeSaleLedgerRows(
      supabase,
      companyId,
      branch.id,
      items.map((item) => item.itemId),
    );
    await supabase.from("product_sales").delete().eq("id", sale.id);
    throw err;
  }

  revalidateProductSales(sale.id);
  redirect(`/product-sales/${sale.id}`);
}

export async function deleteProductSale(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const saleId = String(formData.get("sale_id") ?? "");

  const { data: sale, error: saleError } = await supabase
    .from("product_sales")
    .select("id")
    .eq("id", saleId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (saleError || !sale) throw saleError ?? new Error("Product sale not found.");

  const { data: items, error: itemsError } = await supabase
    .from("product_sale_items")
    .select("id")
    .eq("product_sale_id", sale.id);
  if (itemsError) throw itemsError;

  await removeSaleLedgerRows(
    supabase,
    companyId,
    branch.id,
    (items ?? []).map((item) => item.id),
  );

  const { error: deleteError } = await supabase.from("product_sales").delete().eq("id", sale.id);
  if (deleteError) throw deleteError;

  revalidateProductSales();
  redirect("/product-sales");
}
