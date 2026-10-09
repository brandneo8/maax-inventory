import { getBundleComponentsForProducts } from "@/lib/data/product-components";
import { businessTxnDate } from "@/lib/format";
import type { ProductClassification } from "@/lib/labels";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Note on the +qty count_adjustment that cancels part of a count shortfall
 * when a product-sale line is linked to it (see
 * 20261002120000_link_sales_to_count_shortfalls.sql) — the cost engine, the
 * usage metrics and the monthly report all key off this exact text.
 */
export const SALE_RECLASS_NOTE = "Reclassified as product sale";

/**
 * The stock-out counterpart of SALE_RECLASS_NOTE: a +qty count_adjustment
 * that cancels part of a count shortfall when a stock-out line opened on or
 * before that count is assigned to it (see
 * 20261004110000_stock_out_count_links.sql). Same handling everywhere.
 */
export const USE_RECLASS_NOTE = "Reclassified as in-house use";

/**
 * Note on the negative count_adjustment that takes back part of a count's
 * surplus when a receipt dated before that count turns out to explain it (see
 * 20261003130000_late_receipt_count_trueups.sql) — the cost engine, usage
 * metrics and monthly report key off this exact text.
 */
export const LATE_RECEIPT_SURPLUS_NOTE = "Count true-up: late receipt (offsets count surplus)";

/**
 * The reverse: a +qty count_adjustment that gives back part of a count's
 * shortfall when a receipt the count had already included is removed (see
 * 20261004170000_removed_receipt_trueups.sql). Treated like a sale
 * reclassification by the cost engine, usage metrics and report.
 */
export const REMOVED_RECEIPT_SHORTFALL_NOTE = "Count true-up: removed receipt (offsets count shortfall)";

export type UsageLedgerLine = {
  referenceId: string;
  productId: string;
  quantity: number;
  entryDate: string;
};

/**
 * Writes the stock deductions for a batch of usage lines (stock-out or POS
 * product sales) in one pass: one batched bundle-component lookup, one
 * batched cost lookup, one inventory_transactions insert. A bundle SKU never
 * carries its own stock or cost (mirrors receiving — see
 * fn_after_goods_receipt_item_insert), so using it deducts each component by
 * its recipe quantity instead; nothing is written against the bundle itself.
 * unit_cost is stamped with the current average here, and
 * fn_recompute_branch_cost re-stamps it to the correct point-in-time average
 * as soon as the rows land.
 */
export async function insertUsageLedgerRows(
  supabase: Client,
  input: {
    companyId: string;
    branchId: string;
    storeLocationId: string;
    userEmail: string | undefined;
    txnType: "retail_use" | "inhouse_use";
    classification: ProductClassification;
    referenceTable: string;
    baseNote: string;
    lines: UsageLedgerLine[];
  },
) {
  if (input.lines.length === 0) return;

  const rows = await buildUsageLedgerRows(supabase, input);
  const { error } = await supabase.from("inventory_transactions").insert(
    rows.map((row) => ({
      company_id: input.companyId,
      product_id: row.productId,
      store_location_id: input.storeLocationId,
      txn_type: input.txnType,
      quantity_change: row.quantityChange,
      reference_table: input.referenceTable,
      reference_id: row.referenceId,
      created_by: input.userEmail,
      notes: row.notes,
      unit_cost: row.unitCost,
      classification: input.classification,
      txn_date: row.txnDate,
    })),
  );
  if (error) throw error;
}

/** One stock deduction worked out by buildUsageLedgerRows (bundles already unpacked). */
export type UsageLedgerRow = {
  referenceId: string;
  productId: string;
  quantityChange: number;
  notes: string;
  unitCost: number;
  txnDate: string;
};

/**
 * Works out the stock deductions for a batch of usage lines without writing
 * them: bundles unpacked into their contents, the current average cost and
 * the ledger date. insertUsageLedgerRows writes them; stock-out saves pass
 * them to fn_save_stock_out so everything is written in one transaction.
 */
export async function buildUsageLedgerRows(
  supabase: Client,
  input: { branchId: string; baseNote: string; lines: UsageLedgerLine[] },
): Promise<UsageLedgerRow[]> {
  if (input.lines.length === 0) return [];

  const componentsByProduct = await getBundleComponentsForProducts(
    supabase,
    input.lines.map((line) => line.productId),
  );

  const txnLines = input.lines.flatMap((line) => {
    const quantity = Math.abs(line.quantity);
    const txnDate = businessTxnDate(line.entryDate);
    const components = componentsByProduct.get(line.productId) ?? [];
    if (components.length > 0) {
      return components.map((component) => ({
        referenceId: line.referenceId,
        productId: component.productId,
        quantity: quantity * component.quantity,
        notes: `${input.baseNote} (unpacked from bundle usage)`,
        txnDate,
      }));
    }
    return [{ referenceId: line.referenceId, productId: line.productId, quantity, notes: input.baseNote, txnDate }];
  });

  const { data: costs } = await supabase
    .from("product_branch_costs")
    .select("product_id, avg_unit_cost")
    .eq("branch_id", input.branchId)
    .in("product_id", [...new Set(txnLines.map((line) => line.productId))]);
  const costByProduct = new Map((costs ?? []).map((row) => [row.product_id, row.avg_unit_cost]));

  return txnLines.map((line) => ({
    referenceId: line.referenceId,
    productId: line.productId,
    quantityChange: -line.quantity,
    notes: line.notes,
    unitCost: Number(costByProduct.get(line.productId) ?? 0),
    txnDate: line.txnDate,
  }));
}
