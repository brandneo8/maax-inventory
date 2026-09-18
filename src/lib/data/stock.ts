import type { createClient } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/format";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getCurrentStock(supabase: Client) {
  const { data: rows, error } = await supabase
    .from("current_stock")
    .select("product_id, store_location_id, quantity_on_hand")
    .gt("quantity_on_hand", 0);

  if (error) throw error;
  if (!rows?.length) return [];

  const productIds = [...new Set(rows.map((row) => row.product_id).filter(Boolean))] as string[];
  const locationIds = [
    ...new Set(rows.map((row) => row.store_location_id).filter(Boolean)),
  ] as string[];

  const [{ data: products }, { data: locations }] = await Promise.all([
    supabase.from("products").select("id, sku, name, order_name").in("id", productIds),
    supabase.from("store_locations").select("id, name, branch_id, branches(name)").in("id", locationIds),
  ]);

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const locationMap = new Map((locations ?? []).map((location) => [location.id, location]));

  return rows.map((row) => {
    const location = row.store_location_id ? locationMap.get(row.store_location_id) : undefined;
    const branch = location
      ? Array.isArray(location.branches)
        ? location.branches[0]
        : location.branches
      : null;

    return {
      product_id: row.product_id,
      store_location_id: row.store_location_id,
      quantity_on_hand: row.quantity_on_hand,
      sku: row.product_id ? productMap.get(row.product_id)?.sku : undefined,
      name: row.product_id ? productDisplayName(productMap.get(row.product_id)) : undefined,
      location_name: location?.name,
      branch_id: location?.branch_id,
      branch_name: branch?.name,
    };
  });
}

export async function getLowStock(supabase: Client) {
  const { data, error } = await supabase
    .from("low_stock_alerts")
    .select("product_id, sku, name, low_stock_threshold, total_on_hand")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

function nextMonth(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  return monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
}

function monthStartIso(month: string) {
  return `${month}-01T00:00:00.000Z`;
}

function monthRange(fromMonth: string, toMonth: string) {
  const months: string[] = [];
  let cursor = fromMonth;
  // Guards against a reversed or absurdly wide range slipping past the
  // page's own clamping and turning into a runaway loop.
  for (let safety = 0; cursor <= toMonth && safety < 240; safety += 1) {
    months.push(cursor);
    cursor = nextMonth(cursor);
  }
  return months;
}

export type MonthlyCogsByTag = { tagName: string; values: number[] };
export type MonthlyGroupedValues = { label: string; values: number[] };

export type MonthlyInventoryReport = {
  months: string[];
  openingBalance: number[];
  ordered: number[];
  used: number[];
  closingBalance: number[];
  // Closing inventory $ balance for each month, grouped by brand (every
  // product has exactly one brand or none, so these rows always add up to
  // closingBalance exactly) and by tag (a multi-tagged product's balance is
  // attributed to every tag it carries, so these rows can sum to more than
  // closingBalance when that happens).
  inventoryByBrand: MonthlyGroupedValues[];
  inventoryByTag: MonthlyGroupedValues[];
  // Cost-of-goods-sold breakdown by transaction type. These five rows
  // always add up to `used` exactly for every month — cogsOther exists
  // specifically to catch anything that doesn't fit the other four, so
  // the breakdown never silently drops part of the total.
  cogsRetail: number[];
  cogsInhouse: number[];
  cogsGwp: number[];
  cogsWastage: number[];
  cogsOther: number[];
  // Same figures as cogsInhouse, split by each in-house product's tags.
  // A multi-tagged product's cost is attributed to every tag it carries,
  // so these rows can sum to more than cogsInhouse when that happens.
  cogsInhouseByTag: MonthlyCogsByTag[];
};

function tagNameFrom(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return "";
  return String((row as { name?: string | null }).name ?? "").trim();
}

function chunkIds<T>(items: T[], size = 200) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

const NO_BRAND = "No brand";
const UNTAGGED = "Untagged";

function sortGroupLabels(labels: string[], lastLabel: string) {
  return [...labels].sort((left, right) => {
    if (left === lastLabel) return 1;
    if (right === lastLabel) return -1;
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  });
}

/**
 * Monthly inventory-value roll-forward for a branch: for each month in
 * [fromMonth, toMonth] ("YYYY-MM"), the opening $ balance, $ received
 * ("ordered" — goods receipts plus count-driven surplus, both genuine
 * inflows), $ consumed ("used" — retail/in-house/GWP use plus count-driven
 * shortfall, both genuine outflows), and the closing balance (opening +
 * ordered - used), plus a cost-of-goods-sold breakdown by retail vs
 * in-house use (and in-house use by tag). Every inventory_transactions
 * row's unit_cost is already the weighted-average cost at the moment that
 * row happened (fn_recompute_branch_cost keeps it that way as the ledger
 * changes), so quantity_change * unit_cost is exactly that row's dollar
 * effect on inventory value — this reads the ledger directly instead of
 * re-deriving costs itself.
 */
export async function getMonthlyInventoryReport(
  supabase: Client,
  companyId: string,
  branchId: string,
  fromMonth: string,
  toMonth: string,
): Promise<MonthlyInventoryReport> {
  const months = monthRange(fromMonth, toMonth);
  const empty: MonthlyInventoryReport = {
    months,
    openingBalance: months.map(() => 0),
    ordered: months.map(() => 0),
    used: months.map(() => 0),
    closingBalance: months.map(() => 0),
    cogsRetail: months.map(() => 0),
    cogsInhouse: months.map(() => 0),
    cogsGwp: months.map(() => 0),
    cogsWastage: months.map(() => 0),
    cogsOther: months.map(() => 0),
    cogsInhouseByTag: [],
    inventoryByBrand: [],
    inventoryByTag: [],
  };
  if (months.length === 0) return empty;

  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return empty;

  const { data: rows, error } = await supabase
    .from("inventory_transactions")
    .select("product_id, txn_type, quantity_change, unit_cost, notes, txn_date")
    .eq("company_id", companyId)
    .in("store_location_id", locationIds)
    .lt("txn_date", monthStartIso(nextMonth(toMonth)));
  if (error) throw error;

  const fromBoundary = monthStartIso(fromMonth);
  const orderedByMonth = new Map<string, number>();
  const usedByMonth = new Map<string, number>();
  const retailByMonth = new Map<string, number>();
  const inhouseByMonth = new Map<string, number>();
  const gwpByMonth = new Map<string, number>();
  const wastageByMonth = new Map<string, number>();
  const otherByMonth = new Map<string, number>();
  const inhouseEntries: { productId: string; month: string; amount: number }[] = [];
  // Per-product running value, independent of the ordered/used split above
  // — this is what "Inventory summary" (by brand/by tag) is built from,
  // since a closing $ balance has to be tracked per product before it can
  // be grouped by that product's own brand or tags.
  const openingCarryByProduct = new Map<string, number>();
  const productMonthDelta = new Map<string, Map<string, number>>();
  let openingCarry = 0;

  for (const row of rows ?? []) {
    const value = Number(row.quantity_change) * Number(row.unit_cost ?? 0);
    const isCountVariance = row.txn_type === "count_adjustment" && row.notes === "Count variance";
    const isInflow = row.txn_type === "goods_receipt" || (isCountVariance && Number(row.quantity_change) > 0);

    if (row.txn_date < fromBoundary) {
      openingCarry += value;
      openingCarryByProduct.set(row.product_id, (openingCarryByProduct.get(row.product_id) ?? 0) + value);
      continue;
    }

    const monthKey = row.txn_date.slice(0, 7);
    const productDeltas = productMonthDelta.get(row.product_id) ?? new Map<string, number>();
    productDeltas.set(monthKey, (productDeltas.get(monthKey) ?? 0) + value);
    productMonthDelta.set(row.product_id, productDeltas);

    if (isInflow) {
      orderedByMonth.set(monthKey, (orderedByMonth.get(monthKey) ?? 0) + value);
      continue;
    }

    // Everything that isn't a ground-truth inflow is a usage-side outflow
    // here (retail/in-house/GWP use, a count shortfall, or some other rare
    // ledger correction) — value is negative, so flip it to a positive
    // "used"/cost amount. Every row lands in exactly one of the four named
    // buckets or "other", so they always add back up to the month's total.
    const amount = -value;
    usedByMonth.set(monthKey, (usedByMonth.get(monthKey) ?? 0) + amount);

    if (row.txn_type === "retail_use") {
      retailByMonth.set(monthKey, (retailByMonth.get(monthKey) ?? 0) + amount);
    } else if (row.txn_type === "inhouse_use") {
      inhouseByMonth.set(monthKey, (inhouseByMonth.get(monthKey) ?? 0) + amount);
      inhouseEntries.push({ productId: row.product_id, month: monthKey, amount });
    } else if (row.txn_type === "gwp_use") {
      gwpByMonth.set(monthKey, (gwpByMonth.get(monthKey) ?? 0) + amount);
    } else if (isCountVariance) {
      wastageByMonth.set(monthKey, (wastageByMonth.get(monthKey) ?? 0) + amount);
    } else {
      otherByMonth.set(monthKey, (otherByMonth.get(monthKey) ?? 0) + amount);
    }
  }

  const inhouseProductIds = [...new Set(inhouseEntries.map((entry) => entry.productId))];
  const tagNamesByProduct = new Map<string, string[]>();
  if (inhouseProductIds.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("product_tags")
      .select("product_id, tags(name)")
      .in("product_id", inhouseProductIds);
    if (tagError) throw tagError;
    for (const tagRow of tagRows ?? []) {
      const name = tagNameFrom(tagRow.tags);
      if (!name) continue;
      const list = tagNamesByProduct.get(tagRow.product_id) ?? [];
      list.push(name);
      tagNamesByProduct.set(tagRow.product_id, list);
    }
  }

  const byTagAndMonth = new Map<string, number>();
  const tagNames = new Set<string>();
  for (const entry of inhouseEntries) {
    const names = tagNamesByProduct.get(entry.productId) ?? [];
    for (const name of names.length > 0 ? names : [UNTAGGED]) {
      tagNames.add(name);
      const key = `${name}|${entry.month}`;
      byTagAndMonth.set(key, (byTagAndMonth.get(key) ?? 0) + entry.amount);
    }
  }
  const cogsInhouseByTag = sortGroupLabels([...tagNames], UNTAGGED).map((tagName) => ({
    tagName,
    values: months.map((month) => byTagAndMonth.get(`${tagName}|${month}`) ?? 0),
  }));

  // Every product that appears anywhere in this branch's history up to
  // toMonth might carry a nonzero balance into the displayed range, even
  // with no activity of its own within it — so this is every product key
  // seen above, not just ones with a delta inside [fromMonth, toMonth].
  const summaryProductIds = [...new Set([...openingCarryByProduct.keys(), ...productMonthDelta.keys()])];
  const closingByProduct = new Map<string, number[]>();
  for (const productId of summaryProductIds) {
    const deltas = productMonthDelta.get(productId);
    let running = openingCarryByProduct.get(productId) ?? 0;
    const values = months.map((month) => {
      running += deltas?.get(month) ?? 0;
      return running;
    });
    closingByProduct.set(productId, values);
  }

  const brandByProduct = new Map<string, string>();
  const tagNamesByProductForInventory = new Map<string, string[]>();
  for (const idsChunk of chunkIds(summaryProductIds)) {
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id, brands(name), product_tags(tags(name))")
      .in("id", idsChunk);
    if (productError) throw productError;
    for (const productRow of productRows ?? []) {
      brandByProduct.set(productRow.id, tagNameFrom(productRow.brands) || NO_BRAND);
      const names = (productRow.product_tags ?? []).flatMap((productTag) => {
        const name = tagNameFrom(productTag.tags);
        return name ? [name] : [];
      });
      tagNamesByProductForInventory.set(productRow.id, names);
    }
  }

  function groupInventoryBy(labelsFor: (productId: string) => string[], lastLabel: string) {
    const totalsByLabel = new Map<string, number[]>();
    for (const productId of summaryProductIds) {
      const values = closingByProduct.get(productId) ?? months.map(() => 0);
      for (const label of labelsFor(productId)) {
        const totals = totalsByLabel.get(label) ?? months.map(() => 0);
        for (let index = 0; index < months.length; index += 1) totals[index] += values[index];
        totalsByLabel.set(label, totals);
      }
    }
    return sortGroupLabels([...totalsByLabel.keys()], lastLabel).map((label) => ({
      label,
      values: totalsByLabel.get(label)!,
    }));
  }
  const inventoryByBrand = groupInventoryBy((productId) => [brandByProduct.get(productId) ?? NO_BRAND], NO_BRAND);
  const inventoryByTag = groupInventoryBy((productId) => {
    const names = tagNamesByProductForInventory.get(productId) ?? [];
    return names.length > 0 ? names : [UNTAGGED];
  }, UNTAGGED);

  const openingBalance: number[] = [];
  const ordered: number[] = [];
  const used: number[] = [];
  const closingBalance: number[] = [];
  const cogsRetail: number[] = [];
  const cogsInhouse: number[] = [];
  const cogsGwp: number[] = [];
  const cogsWastage: number[] = [];
  const cogsOther: number[] = [];
  let runningOpen = openingCarry;
  for (const month of months) {
    const monthOrdered = orderedByMonth.get(month) ?? 0;
    const monthUsed = usedByMonth.get(month) ?? 0;
    const close = runningOpen + monthOrdered - monthUsed;
    openingBalance.push(runningOpen);
    ordered.push(monthOrdered);
    used.push(monthUsed);
    closingBalance.push(close);
    cogsRetail.push(retailByMonth.get(month) ?? 0);
    cogsInhouse.push(inhouseByMonth.get(month) ?? 0);
    cogsGwp.push(gwpByMonth.get(month) ?? 0);
    cogsWastage.push(wastageByMonth.get(month) ?? 0);
    cogsOther.push(otherByMonth.get(month) ?? 0);
    runningOpen = close;
  }

  return {
    months,
    openingBalance,
    ordered,
    used,
    closingBalance,
    inventoryByBrand,
    inventoryByTag,
    cogsRetail,
    cogsInhouse,
    cogsGwp,
    cogsWastage,
    cogsOther,
    cogsInhouseByTag,
  };
}

function firstOfOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type ProductLedgerRow = {
  id: string;
  txnType: string;
  quantityChange: number;
  txnDate: string;
  notes: string | null;
  reference: { label: string; href?: string } | null;
};

/**
 * The full inventory history for one product at one branch — every
 * addition (goods receipts), deduction (retail/in-house use), and count
 * adjustment, newest first, each resolved to a link back to its source
 * (the PO, stock-out report, or count that caused it). Adapted from the
 * former /movement page's ledger query, scoped down to a single product
 * instead of the whole branch.
 */
export async function getProductLedger(supabase: Client, companyId: string, branchId: string, productId: string) {
  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return [] as ProductLedgerRow[];

  const { data: rows, error } = await supabase
    .from("inventory_transactions")
    .select("id, txn_type, quantity_change, txn_date, notes, reference_table, reference_id")
    .eq("company_id", companyId)
    .eq("product_id", productId)
    .in("store_location_id", locationIds)
    .order("txn_date", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  if (!rows?.length) return [] as ProductLedgerRow[];

  const receiptItemIds = rows
    .filter((row) => row.reference_table === "goods_receipt_items" && row.reference_id)
    .map((row) => row.reference_id as string);
  const countItemIds = rows
    .filter((row) => row.reference_table === "inventory_count_items" && row.reference_id)
    .map((row) => row.reference_id as string);
  const retailEntryIds = rows
    .filter((row) => row.reference_table === "retail_use_entries" && row.reference_id)
    .map((row) => row.reference_id as string);

  const [{ data: receiptItems }, { data: countItems }, { data: retailEntries }] = await Promise.all([
    receiptItemIds.length
      ? supabase
          .from("goods_receipt_items")
          .select("id, goods_receipts(purchase_order_id, purchase_orders(po_number))")
          .in("id", receiptItemIds)
      : Promise.resolve({ data: [] as { id: string; goods_receipts: unknown }[] }),
    countItemIds.length
      ? supabase
          .from("inventory_count_items")
          .select("id, inventory_count_id, inventory_counts(count_date)")
          .in("id", countItemIds)
      : Promise.resolve({ data: [] as { id: string; inventory_count_id: string; inventory_counts: unknown }[] }),
    retailEntryIds.length
      ? supabase.from("retail_use_entries").select("id, stock_out_report_id").in("id", retailEntryIds)
      : Promise.resolve({ data: [] as { id: string; stock_out_report_id: string | null }[] }),
  ]);

  const receiptMap = new Map((receiptItems ?? []).map((item) => [item.id, item]));
  const countItemMap = new Map((countItems ?? []).map((item) => [item.id, item]));
  const retailEntryMap = new Map((retailEntries ?? []).map((entry) => [entry.id, entry]));

  return rows.map((row): ProductLedgerRow => {
    let reference: ProductLedgerRow["reference"] = null;

    if (row.reference_table === "goods_receipt_items" && row.reference_id) {
      const item = receiptMap.get(row.reference_id) as
        | { goods_receipts: { purchase_order_id: string | null; purchase_orders: unknown } | null }
        | undefined;
      const receipt = firstOfOne(item?.goods_receipts ?? null);
      const po = firstOfOne((receipt?.purchase_orders as { po_number: string } | { po_number: string }[]) ?? null);
      reference = po?.po_number
        ? { label: po.po_number, href: receipt?.purchase_order_id ? `/stock-in/${receipt.purchase_order_id}` : undefined }
        : { label: "Purchase order" };
    } else if (row.reference_table === "inventory_count_items" && row.reference_id) {
      const item = countItemMap.get(row.reference_id) as
        | { inventory_count_id: string; inventory_counts: unknown }
        | undefined;
      const inventoryCount = firstOfOne((item?.inventory_counts as { count_date: string } | { count_date: string }[]) ?? null);
      reference = item
        ? { label: inventoryCount ? `Count ${inventoryCount.count_date}` : "Count", href: `/counts/${item.inventory_count_id}` }
        : { label: "Count" };
    } else if (row.reference_table === "retail_use_entries" && row.reference_id) {
      const entry = retailEntryMap.get(row.reference_id) as { stock_out_report_id: string | null } | undefined;
      reference = entry?.stock_out_report_id
        ? { label: "Stock-out", href: `/stock-out/${entry.stock_out_report_id}` }
        : { label: "Stock-out" };
    }

    return {
      id: row.id,
      txnType: row.txn_type,
      quantityChange: Number(row.quantity_change),
      txnDate: row.txn_date,
      notes: row.notes,
      reference,
    };
  });
}
