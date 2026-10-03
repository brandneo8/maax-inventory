import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { LATE_RECEIPT_SURPLUS_NOTE } from "@/lib/data/usage-ledger";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const IN_CHUNK = 200;

function chunk<T>(items: T[], size = IN_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

type CountRow = { id: string; countDate: string; ts: string };
type CountItem = { id: string; countId: string; productId: string; counted: number | null; variance: number };

/**
 * The ledger timestamp a confirmed count posted at — every variance row it
 * wrote shares it. Falls back to the end of the count date for a count that
 * posted no variances at all.
 */
async function countTimestamp(supabase: Client, countId: string, countDate: string) {
  for (let from = 0; ; from += 1000) {
    const { data: items, error } = await supabase
      .from("inventory_count_items")
      .select("id")
      .eq("inventory_count_id", countId)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    if (!items?.length) break;
    for (const ids of chunk(items.map((item) => item.id))) {
      const { data, error: rowError } = await supabase
        .from("inventory_transactions")
        .select("txn_date")
        .eq("reference_table", "inventory_count_items")
        .eq("notes", "Count variance")
        .in("reference_id", ids)
        .order("txn_date")
        .limit(1);
      if (rowError) throw rowError;
      if (data?.length) return data[0].txn_date;
    }
    if (items.length < 1000) break;
  }
  return `${countDate}T23:59:59.999Z`;
}

/**
 * When a receipt is dated before a confirmed count, the count's physical
 * numbers stay the truth: for each product the receipt brought in, this
 * writes true-up rows on the first confirmed count after the receipt that
 * counted that product, so the balance at that count is exactly what was
 * counted. Up to the count's unclaimed surplus the receipt explains what the
 * count "found" (LATE_RECEIPT_SURPLUS_NOTE, taken out at the surplus's own
 * cost); any remainder must have gone before the count, so it extends the
 * count's shortfall (a 'Count variance' row). A bundle line first clears any
 * surplus the count found on the bundle code itself, then falls back to its
 * components for whatever's left. Every row is tagged with the receipt so
 * it can be removed with it. Does nothing for a receipt dated after every
 * confirmed count.
 */
export async function applyLateReceiptTrueUps(
  supabase: Client,
  input: { companyId: string; branchId: string; receiptId: string; createdBy: string | undefined },
) {
  const { data: receiptItems, error: itemsError } = await supabase
    .from("goods_receipt_items")
    .select("id, product_id, quantity_received")
    .eq("goods_receipt_id", input.receiptId);
  if (itemsError) throw itemsError;
  if (!receiptItems?.length) return;

  const { data: receiptRows, error: rowsError } = await supabase
    .from("inventory_transactions")
    .select("reference_id, product_id, quantity_change, txn_date")
    .eq("reference_table", "goods_receipt_items")
    .eq("txn_type", "goods_receipt")
    .in(
      "reference_id",
      receiptItems.map((item) => item.id),
    );
  if (rowsError) throw rowsError;
  if (!receiptRows?.length) return;
  const receiptTs = receiptRows.reduce((min, row) => (row.txn_date < min ? row.txn_date : min), receiptRows[0].txn_date);

  const { data: counts, error: countsError } = await supabase
    .from("inventory_counts")
    .select("id, count_date")
    .eq("company_id", input.companyId)
    .eq("branch_id", input.branchId)
    .eq("status", "completed")
    .gte("count_date", receiptTs.slice(0, 10))
    .order("count_date");
  if (countsError) throw countsError;
  if (!counts?.length) return;

  const laterCounts: CountRow[] = [];
  for (const count of counts) {
    const ts = await countTimestamp(supabase, count.id, count.count_date);
    if (ts > receiptTs) laterCounts.push({ id: count.id, countDate: count.count_date, ts });
  }
  if (laterCounts.length === 0) return;
  laterCounts.sort((left, right) => left.ts.localeCompare(right.ts));

  const relevantProductIds = [
    ...new Set([...receiptItems.map((item) => item.product_id), ...receiptRows.map((row) => row.product_id)]),
  ];
  const countItems: CountItem[] = [];
  for (const ids of chunk(relevantProductIds)) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id, inventory_count_id, product_id, counted_quantity, variance")
      .in(
        "inventory_count_id",
        laterCounts.map((count) => count.id),
      )
      .in("product_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      countItems.push({
        id: row.id,
        countId: row.inventory_count_id,
        productId: row.product_id,
        counted: row.counted_quantity == null ? null : Number(row.counted_quantity),
        variance: Number(row.variance ?? 0),
      });
    }
  }

  /** The first later count that actually counted this product — its checkpoint. */
  function checkpointFor(productId: string) {
    for (const count of laterCounts) {
      const item = countItems.find(
        (candidate) => candidate.countId === count.id && candidate.productId === productId && candidate.counted != null,
      );
      if (item) return { count, item };
    }
    return null;
  }

  // Surplus already taken back by earlier late receipts, per count item.
  const offsetSoFar = new Map<string, number>();
  const surplusCost = new Map<string, number>();
  for (const ids of chunk(countItems.map((item) => item.id))) {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("reference_id, quantity_change, unit_cost, notes")
      .eq("reference_table", "inventory_count_items")
      .eq("txn_type", "count_adjustment")
      .in("notes", ["Count variance", LATE_RECEIPT_SURPLUS_NOTE])
      .in("reference_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.reference_id) continue;
      if (row.notes === LATE_RECEIPT_SURPLUS_NOTE) {
        offsetSoFar.set(row.reference_id, (offsetSoFar.get(row.reference_id) ?? 0) + Math.abs(Number(row.quantity_change)));
      } else if (Number(row.quantity_change) > 0) {
        surplusCost.set(row.reference_id, Number(row.unit_cost ?? 0));
      }
    }
  }

  const storeLocationId = await getDefaultStoreLocationId(supabase, input.branchId);
  const trueUps: {
    company_id: string;
    product_id: string;
    store_location_id: string;
    txn_type: "count_adjustment";
    quantity_change: number;
    reference_table: string;
    reference_id: string;
    created_by: string | undefined;
    notes: string;
    unit_cost: number;
    txn_date: string;
    trueup_goods_receipt_id: string;
  }[] = [];

  function trueUp(productId: string, quantity: number, allowShortfall: boolean) {
    if (quantity <= 0) return 0;
    const checkpoint = checkpointFor(productId);
    if (!checkpoint) return 0;
    const { count, item } = checkpoint;
    const available = Math.max(0, Math.max(0, item.variance) - (offsetSoFar.get(item.id) ?? 0));
    const offset = Math.min(quantity, available);
    const base = {
      company_id: input.companyId,
      product_id: productId,
      store_location_id: storeLocationId,
      txn_type: "count_adjustment" as const,
      reference_table: "inventory_count_items",
      reference_id: item.id,
      created_by: input.createdBy,
      txn_date: count.ts,
      trueup_goods_receipt_id: input.receiptId,
    };
    if (offset > 0) {
      trueUps.push({
        ...base,
        quantity_change: -offset,
        notes: LATE_RECEIPT_SURPLUS_NOTE,
        unit_cost: surplusCost.get(item.id) ?? 0,
      });
      offsetSoFar.set(item.id, (offsetSoFar.get(item.id) ?? 0) + offset);
    }
    const remainder = quantity - offset;
    if (allowShortfall && remainder > 0) {
      trueUps.push({ ...base, quantity_change: -remainder, notes: "Count variance", unit_cost: 0 });
    }
    return allowShortfall ? quantity : offset;
  }

  // Plain products are reconciled per product across the whole receipt.
  const plainByProduct = new Map<string, number>();
  for (const item of receiptItems) {
    const rows = receiptRows.filter((row) => row.reference_id === item.id);
    const isBundleLine = rows.some((row) => row.product_id !== item.product_id);
    if (!isBundleLine) {
      plainByProduct.set(item.product_id, (plainByProduct.get(item.product_id) ?? 0) + Number(item.quantity_received));
      continue;
    }
    // A bundle line: the count may have found the boxes on the bundle code
    // itself. Clear that first; whatever boxes are left are reconciled as
    // their components, where the stock actually landed.
    const boxes = Number(item.quantity_received);
    const clearedBoxes = trueUp(item.product_id, boxes, false);
    const share = boxes > 0 ? (boxes - clearedBoxes) / boxes : 0;
    for (const row of rows) {
      const remaining = Number(row.quantity_change) * share;
      if (remaining > 0) plainByProduct.set(row.product_id, (plainByProduct.get(row.product_id) ?? 0) + remaining);
    }
  }
  for (const [productId, quantity] of plainByProduct) trueUp(productId, quantity, true);

  if (trueUps.length === 0) return;
  const { error: insertError } = await supabase.from("inventory_transactions").insert(trueUps);
  if (insertError) throw insertError;
}

/**
 * Removes a receipt's count true-up rows and replays cost for the products
 * they touched — the cost trigger only fires on insert. Run before a receipt
 * is removed or re-dated.
 */
export async function removeLateReceiptTrueUps(
  supabase: Client,
  input: { companyId: string; branchId: string; receiptId: string },
) {
  const { data: rows, error } = await supabase
    .from("inventory_transactions")
    .select("id, product_id")
    .eq("trueup_goods_receipt_id", input.receiptId);
  if (error) throw error;
  const productIds = [...new Set((rows ?? []).map((row) => row.product_id))];
  if (productIds.length === 0) return;

  // A shortfall this receipt added may since have been applied to a product
  // sale — that sale has to let go of it first.
  const { data: links, error: linksError } = await supabase
    .from("product_sale_items")
    .select("id")
    .in(
      "linked_count_txn_id",
      (rows ?? []).map((row) => row.id),
    )
    .limit(1);
  if (linksError) throw linksError;
  if (links?.length) {
    throw new Error(
      "A product sale is applied to a count shortfall this receipt created. Remove that sale (or its link) first.",
    );
  }

  const { error: deleteError } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("trueup_goods_receipt_id", input.receiptId);
  if (deleteError) throw deleteError;

  for (const productId of productIds) {
    const { error: recomputeError } = await supabase.rpc("fn_recompute_branch_cost", {
      p_company_id: input.companyId,
      p_product_id: productId,
      p_branch_id: input.branchId,
    });
    if (recomputeError) throw new Error(recomputeError.message || "Could not update product costs.");
  }
}
