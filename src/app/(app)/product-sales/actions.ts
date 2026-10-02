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

/**
 * Saves a product sale as a draft, or confirms it. A draft stores its lines
 * (products, dates, prices, count links) but writes nothing to the ledger, so
 * it can be reopened and edited; confirming posts it. Passing `sale_id`
 * replaces an existing draft's details and lines — a confirmed sale can only
 * have its report date and remarks changed (updateProductSaleDetails).
 */
export async function saveProductSale(input: {
  sale_id?: string | null;
  branch_id: string;
  sale_date: string;
  notes: string;
  lines: ProductSaleLineInput[];
  confirm: boolean;
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  if (input.confirm) await assertNoActiveCount(supabase, companyId, branch.id, "record product sales");
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  const today = singaporeToday();
  if (!ISO_DATE.test(input.sale_date)) throw new Error("Enter a valid report date.");
  if (input.sale_date > today) throw new Error("The report date can't be after today.");

  const lines = input.lines.filter((line) => line.product_id && line.quantity > 0);
  if (lines.length === 0) throw new Error("Add at least one product with a quantity.");
  for (const line of lines) {
    if (!Number.isFinite(line.unit_sale_price) || line.unit_sale_price < 0) {
      throw new Error("Each line needs a unit price of 0 or more.");
    }
    if (!ISO_DATE.test(line.sale_date)) throw new Error("Each line needs a valid date sold.");
    if (line.sale_date > input.sale_date) throw new Error("A line's date sold can't be after the report date.");
  }
  const shortfallByTxn = await validateCountLinks(supabase, companyId, branch.id, lines);

  const notes = input.notes.trim() || null;
  let saleId: string;
  let createdNow = false;

  if (input.sale_id) {
    const { data: existing, error: existingError } = await supabase
      .from("product_sales")
      .select("id, status")
      .eq("id", input.sale_id)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .single();
    if (existingError || !existing) throw existingError ?? new Error("Product sale not found.");
    if (existing.status !== "draft") {
      throw new Error("This sale is already confirmed — only its report date and remarks can be changed.");
    }
    const { error: updateError } = await supabase
      .from("product_sales")
      .update({ sale_date: input.sale_date, notes })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    // A draft has no ledger rows, so its lines can simply be replaced.
    const { error: clearError } = await supabase.from("product_sale_items").delete().eq("product_sale_id", existing.id);
    if (clearError) throw clearError;
    saleId = existing.id;
  } else {
    const { data: created, error: saleError } = await supabase
      .from("product_sales")
      .insert({
        company_id: companyId,
        branch_id: branch.id,
        sale_date: input.sale_date,
        notes,
        keyed_in_by: user.email,
        status: "draft",
      })
      .select("id")
      .single();
    if (saleError || !created) throw saleError ?? new Error("Could not create the product sale.");
    saleId = created.id;
    createdNow = true;
  }

  const items = lines.map((line) => ({ ...line, itemId: randomUUID() }));
  const { error: itemsError } = await supabase.from("product_sale_items").insert(
    items.map((item) => ({
      id: item.itemId,
      product_sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_sale_price: item.unit_sale_price,
      sale_date: item.sale_date,
      linked_count_txn_id: item.linked_count_txn_id || null,
      linked_quantity: item.linked_count_txn_id ? Number(item.linked_quantity) : null,
    })),
  );
  if (itemsError) {
    if (createdNow) await supabase.from("product_sales").delete().eq("id", saleId);
    throw itemsError;
  }

  if (!input.confirm) {
    revalidateProductSales(saleId);
    redirect(`/product-sales/${saleId}`);
  }

  const storeLocationId = await getDefaultStoreLocationId(supabase, branch.id);
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

    const { error: statusError } = await supabase.from("product_sales").update({ status: "confirmed" }).eq("id", saleId);
    if (statusError) throw statusError;
  } catch (err) {
    // Undo whatever reached the ledger; the sale itself stays behind as a
    // draft so nothing the user entered is lost.
    await removeSaleLedgerRows(
      supabase,
      companyId,
      branch.id,
      items.map((item) => item.itemId),
    );
    revalidateProductSales(saleId);
    throw err;
  }

  revalidateProductSales(saleId);
  redirect(`/product-sales/${saleId}`);
}

/**
 * The parts of a confirmed sale that can change after it's posted: the
 * report date and remarks. Each line posted on its own date sold, so moving
 * the report date doesn't touch stock — it just can't go after today or
 * before any line's date sold. Remarks also become the notes on the sale's
 * retail_use ledger rows, so those are updated to match.
 */
export async function updateProductSaleDetails(input: { sale_id: string; sale_date: string; notes: string }) {
  const { supabase, companyId, branch } = await requireBranch();
  const today = singaporeToday();
  if (!ISO_DATE.test(input.sale_date)) throw new Error("Enter a valid report date.");
  if (input.sale_date > today) throw new Error("The report date can't be after today.");

  const { data: sale, error: saleError } = await supabase
    .from("product_sales")
    .select("id, status")
    .eq("id", input.sale_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (saleError || !sale) throw saleError ?? new Error("Product sale not found.");

  const { data: items, error: itemsError } = await supabase
    .from("product_sale_items")
    .select("id, sale_date")
    .eq("product_sale_id", sale.id);
  if (itemsError) throw itemsError;
  const latestLineDate = (items ?? []).reduce((latest, item) => (item.sale_date > latest ? item.sale_date : latest), "");
  if (latestLineDate && input.sale_date < latestLineDate) {
    throw new Error(`The report date can't be before the latest line's date sold (${latestLineDate}).`);
  }

  const notes = input.notes.trim() || null;
  const { error: updateError } = await supabase
    .from("product_sales")
    .update({ sale_date: input.sale_date, notes })
    .eq("id", sale.id);
  if (updateError) throw updateError;

  const itemIds = (items ?? []).map((item) => item.id);
  if (sale.status === "confirmed" && itemIds.length > 0) {
    const baseNote = notes ?? "Product sale (POS)";
    const { error: plainError } = await supabase
      .from("inventory_transactions")
      .update({ notes: baseNote })
      .eq("reference_table", REFERENCE_TABLE)
      .eq("txn_type", "retail_use")
      .in("reference_id", itemIds)
      .not("notes", "like", "%(unpacked from bundle usage)");
    if (plainError) throw plainError;
    const { error: bundleError } = await supabase
      .from("inventory_transactions")
      .update({ notes: `${baseNote} (unpacked from bundle usage)` })
      .eq("reference_table", REFERENCE_TABLE)
      .eq("txn_type", "retail_use")
      .in("reference_id", itemIds)
      .like("notes", "%(unpacked from bundle usage)");
    if (bundleError) throw bundleError;
  }

  revalidateProductSales(sale.id);
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
