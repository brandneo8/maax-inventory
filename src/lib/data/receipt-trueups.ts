import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { LATE_RECEIPT_SURPLUS_NOTE, REMOVED_RECEIPT_SHORTFALL_NOTE } from "@/lib/data/usage-ledger";
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
  const { data: receipt, error } = await supabase
    .from("goods_receipts")
    .select("voided_at")
    .eq("id", input.receiptId)
    .single();
  if (error || !receipt) throw error ?? new Error("Receipt not found.");
  // A removed receipt: every count that included it gives its units back.
  if (receipt.voided_at) return applyRemovedReceiptTrueUps(supabase, input, "removed");
  // A live receipt: counts that missed it but it's dated before (late), and
  // counts that included it but it's now dated after (moved past the count).
  await applyLateModeTrueUps(supabase, input);
  await applyRemovedReceiptTrueUps(supabase, input, "moved");
}

/** The late-receipt direction of applyLateReceiptTrueUps (see its comment). */
async function applyLateModeTrueUps(
  supabase: Client,
  input: { companyId: string; branchId: string; receiptId: string; createdBy: string | undefined },
) {
  const { data: receiptItems, error: itemsError } = await supabase
    .from("goods_receipt_items")
    .select("id, product_id, quantity_received")
    .eq("goods_receipt_id", input.receiptId);
  if (itemsError) throw itemsError;
  if (!receiptItems?.length) return;

  // When the receipt was keyed in. Receiving is blocked while a count is in
  // progress, so a receipt keyed before a count was started was already in
  // that count's expected quantities — only counts started before the
  // receipt was keyed (i.e. confirmed without it) need a true-up, however
  // early the receipt is dated.
  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("created_at, voided_at")
    .eq("id", input.receiptId)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");
  // A removed receipt's corrections run the other way (see applyRemovedReceiptTrueUps).

  const { data: receiptRows, error: rowsError } = await supabase
    .from("inventory_transactions")
    .select("reference_id, product_id, quantity_change, txn_date")
    .eq("reference_table", "goods_receipt_items")
    .eq("txn_type", "goods_receipt")
    .gt("quantity_change", 0)
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
    .lt("created_at", receipt.created_at)
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
 * Checks, before anything is changed, that the receipts' count true-ups can
 * be lifted: none of them may be a shortfall a product sale or stock-out line
 * has since been applied to. Removing, voiding and re-dating run this first,
 * so they refuse up front instead of failing half-way.
 */
export async function assertReceiptTrueUpsRemovable(supabase: Client, receiptIds: string[]) {
  if (receiptIds.length === 0) return;
  const { data: rows, error } = await supabase
    .from("inventory_transactions")
    .select("id")
    .in("trueup_goods_receipt_id", receiptIds);
  if (error) throw error;
  const rowIds = (rows ?? []).map((row) => row.id);
  if (rowIds.length === 0) return;
  for (const ids of chunk(rowIds)) {
    const [{ data: saleLinks, error: saleError }, { data: useLinks, error: useError }] = await Promise.all([
      supabase.from("product_sale_items").select("id").in("linked_count_txn_id", ids).limit(1),
      supabase.from("retail_use_entries").select("id").in("linked_count_txn_id", ids).limit(1),
    ]);
    if (saleError) throw saleError;
    if (useError) throw useError;
    if (saleLinks?.length) {
      throw new Error(
        "A product sale is applied to a count shortfall this receipt created. Remove that sale (or its link) first.",
      );
    }
    if (useLinks?.length) {
      throw new Error(
        "A stock-out line is assigned to a count shortfall this receipt created. Set it back to an extra deduction first.",
      );
    }
  }
}

/**
 * Puts receipts' count true-ups back to what their current dates call for —
 * the undo step when removing, voiding or re-dating doesn't go through.
 * Carries on past a failing receipt and reports the first error.
 */
export async function restoreReceiptTrueUps(
  supabase: Client,
  scopes: { companyId: string; branchId: string; receiptId: string }[],
  createdBy: string | undefined,
) {
  let firstError: unknown = null;
  for (const scope of scopes) {
    try {
      await removeLateReceiptTrueUps(supabase, scope);
      await applyLateReceiptTrueUps(supabase, { ...scope, createdBy });
    } catch (err) {
      firstError ??= err;
    }
  }
  if (firstError) throw firstError;
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
  const { data: useLinks, error: useLinksError } = await supabase
    .from("retail_use_entries")
    .select("id")
    .in(
      "linked_count_txn_id",
      (rows ?? []).map((row) => row.id),
    )
    .limit(1);
  if (useLinksError) throw useLinksError;
  if (useLinks?.length) {
    throw new Error(
      "A stock-out line is assigned to a count shortfall this receipt created. Set it back to an extra deduction first.",
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

/**
 * The reverse of the late-receipt true-up, for a count that had already
 * included a receipt in its starting balance (the receipt was keyed in
 * before the count started) when that receipt turns out not to belong
 * there:
 *   - "removed": the receipt is being removed — its units never arrived;
 *   - "moved": the receipt is now dated after the count — they arrived later.
 * Either way the count measured the shelf without those units, so its
 * shortfall already took them off, and the reversal (or the receipt's later
 * date) would take them off again. So, on the first such count that counted
 * each product, give the units back: up to the count's unclaimed shortfall as
 * REMOVED_RECEIPT_SHORTFALL_NOTE (it cancels that much shortfall), and any
 * more as a surplus the count really found (+'Count variance' at $0). The
 * counted balance stays exactly as counted. Rows are tagged with the
 * receipt, so removeLateReceiptTrueUps takes them back out (on re-dating, or
 * if a removal doesn't go through).
 */
export async function applyRemovedReceiptTrueUps(
  supabase: Client,
  input: { companyId: string; branchId: string; receiptId: string; createdBy: string | undefined },
  mode: "removed" | "moved" = "removed",
) {
  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("created_at")
    .eq("id", input.receiptId)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");

  const { data: receiptItems, error: itemsError } = await supabase
    .from("goods_receipt_items")
    .select("id")
    .eq("goods_receipt_id", input.receiptId);
  if (itemsError) throw itemsError;
  if (!receiptItems?.length) return;

  // What the receipt put into stock, per product (bundles are already unpacked here).
  const { data: receiptRows, error: rowsError } = await supabase
    .from("inventory_transactions")
    .select("product_id, quantity_change, txn_date")
    .eq("reference_table", "goods_receipt_items")
    .eq("txn_type", "goods_receipt")
    .gt("quantity_change", 0)
    .in(
      "reference_id",
      receiptItems.map((item) => item.id),
    );
  if (rowsError) throw rowsError;
  if (!receiptRows?.length) return;
  const receiptTs = receiptRows.reduce((min, row) => (row.txn_date < min ? row.txn_date : min), receiptRows[0].txn_date);
  const quantityByProduct = new Map<string, number>();
  for (const row of receiptRows) {
    quantityByProduct.set(row.product_id, (quantityByProduct.get(row.product_id) ?? 0) + Number(row.quantity_change));
  }

  // Counts that included it: started after it was keyed in. When removing,
  // all of them; when it's been moved, only those it's now dated after.
  const { data: counts, error: countsError } = await supabase
    .from("inventory_counts")
    .select("id, count_date")
    .eq("company_id", input.companyId)
    .eq("branch_id", input.branchId)
    .eq("status", "completed")
    .gt("created_at", receipt.created_at)
    .order("count_date");
  if (countsError) throw countsError;
  if (!counts?.length) return;
  const includingCounts: CountRow[] = [];
  for (const count of counts) {
    const ts = await countTimestamp(supabase, count.id, count.count_date);
    if (mode === "removed" || ts < receiptTs) includingCounts.push({ id: count.id, countDate: count.count_date, ts });
  }
  if (includingCounts.length === 0) return;
  includingCounts.sort((left, right) => left.ts.localeCompare(right.ts));

  const productIds = [...quantityByProduct.keys()];
  const countItems: CountItem[] = [];
  for (const ids of chunk(productIds)) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id, inventory_count_id, product_id, counted_quantity, variance")
      .in(
        "inventory_count_id",
        includingCounts.map((count) => count.id),
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

  // Each count item's shortfall still free to give back: its shortfall rows,
  // less what product sales and stock-outs have claimed and what earlier
  // removed receipts already gave back.
  const shortfallLeft = new Map<string, number>();
  const shortfallCost = new Map<string, number>();
  for (const ids of chunk(countItems.map((item) => item.id))) {
    const { data: rows, error } = await supabase
      .from("inventory_transactions")
      .select("id, reference_id, quantity_change, unit_cost, notes")
      .eq("reference_table", "inventory_count_items")
      .eq("txn_type", "count_adjustment")
      .in("notes", ["Count variance", REMOVED_RECEIPT_SHORTFALL_NOTE])
      .in("reference_id", ids);
    if (error) throw error;
    const shortfallRowIds: string[] = [];
    const itemByRow = new Map<string, string>();
    for (const row of rows ?? []) {
      if (!row.reference_id) continue;
      const quantity = Number(row.quantity_change);
      if (row.notes === "Count variance" && quantity < 0) {
        shortfallLeft.set(row.reference_id, (shortfallLeft.get(row.reference_id) ?? 0) + Math.abs(quantity));
        shortfallCost.set(row.reference_id, Number(row.unit_cost ?? 0));
        shortfallRowIds.push(row.id);
        itemByRow.set(row.id, row.reference_id);
      } else if (row.notes === REMOVED_RECEIPT_SHORTFALL_NOTE) {
        shortfallLeft.set(row.reference_id, (shortfallLeft.get(row.reference_id) ?? 0) - Math.abs(quantity));
      }
    }
    for (const rowIds of chunk(shortfallRowIds)) {
      const [{ data: sales, error: salesError }, { data: uses, error: usesError }] = await Promise.all([
        supabase
          .from("product_sale_items")
          .select("linked_count_txn_id, linked_quantity, quantity, product_sales!inner(status)")
          .eq("product_sales.status", "confirmed")
          .in("linked_count_txn_id", rowIds),
        supabase.from("retail_use_entries").select("linked_count_txn_id, linked_quantity").in("linked_count_txn_id", rowIds),
      ]);
      if (salesError) throw salesError;
      if (usesError) throw usesError;
      for (const link of [...(sales ?? []), ...(uses ?? [])]) {
        if (!link.linked_count_txn_id) continue;
        const item = itemByRow.get(link.linked_count_txn_id);
        if (!item) continue;
        const claimed = Number(link.linked_quantity ?? ("quantity" in link ? link.quantity : 0));
        shortfallLeft.set(item, (shortfallLeft.get(item) ?? 0) - claimed);
      }
    }
  }

  const storeLocationId = await getDefaultStoreLocationId(supabase, input.branchId);
  const rows = [];
  for (const [productId, quantity] of quantityByProduct) {
    const count = includingCounts.find((candidate) =>
      countItems.some((item) => item.countId === candidate.id && item.productId === productId && item.counted != null),
    );
    if (!count) continue;
    const item = countItems.find((candidate) => candidate.countId === count.id && candidate.productId === productId)!;
    const giveBack = Math.min(quantity, Math.max(0, shortfallLeft.get(item.id) ?? 0));
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
    if (giveBack > 0) {
      rows.push({
        ...base,
        quantity_change: giveBack,
        notes: REMOVED_RECEIPT_SHORTFALL_NOTE,
        unit_cost: shortfallCost.get(item.id) ?? 0,
      });
      shortfallLeft.set(item.id, (shortfallLeft.get(item.id) ?? 0) - giveBack);
    }
    if (quantity > giveBack) {
      rows.push({ ...base, quantity_change: quantity - giveBack, notes: "Count variance", unit_cost: 0 });
    }
  }

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("inventory_transactions").insert(rows);
  if (insertError) throw insertError;
}
