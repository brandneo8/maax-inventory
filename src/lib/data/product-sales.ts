import { productDisplayName, shiftMonth, singaporeToday } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

function chunk<T>(items: T[], size = IN_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export type CountShortfall = {
  txnId: string;
  productId: string;
  productLabel: string;
  sku: string | null;
  countId: string | null;
  countDate: string | null;
  shortfall: number;
  linked: number;
  remaining: number;
  unitCost: number;
  storeLocationId: string;
  txnDate: string;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Count shortfalls at this salon a product-sale or stock-out line could be
 * linked to: count_adjustment rows noted "Count variance" with a negative
 * quantity, from counts that haven't been voided, with how much of each is
 * already claimed by confirmed sale lines and assigned stock-out lines. Filter to every product at the salon (the
 * form's count table) or by ledger row id (validating a save).
 */
export async function getCountShortfalls(
  supabase: Client,
  companyId: string,
  branchId: string,
  filter: { allProducts: true } | { txnIds: string[] },
): Promise<CountShortfall[]> {
  if ("txnIds" in filter && filter.txnIds.length === 0) return [];

  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return [];

  type ShortfallRow = {
    id: string;
    product_id: string;
    quantity_change: number;
    unit_cost: number | null;
    txn_date: string;
    reference_id: string | null;
    store_location_id: string;
    products: unknown;
  };
  const rows: ShortfallRow[] = [];
  const idBatches = "txnIds" in filter ? chunk(filter.txnIds) : [null];
  for (const ids of idBatches) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("inventory_transactions")
        .select(
          "id, product_id, quantity_change, unit_cost, txn_date, reference_id, store_location_id, products(sku, name, order_name)",
        )
        .eq("company_id", companyId)
        .eq("txn_type", "count_adjustment")
        .eq("notes", "Count variance")
        .eq("reference_table", "inventory_count_items")
        .lt("quantity_change", 0)
        .in("store_location_id", locationIds);
      if (ids) query = query.in("id", ids);
      const { data, error } = await query.order("id").range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as ShortfallRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  if (rows.length === 0) return [];

  const countItemIds = [...new Set(rows.map((row) => row.reference_id).filter(Boolean))] as string[];
  const countByItem = new Map<string, { countId: string; countDate: string | null; status: string | undefined }>();
  for (const ids of chunk(countItemIds)) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id, inventory_count_id, inventory_counts(count_date, status)")
      .in("id", ids);
    if (error) throw error;
    for (const item of data ?? []) {
      const count = firstOf(item.inventory_counts as { count_date: string; status: string } | null);
      countByItem.set(item.id, {
        countId: item.inventory_count_id,
        countDate: count?.count_date ?? null,
        status: count?.status,
      });
    }
  }

  // Only confirmed sales have cleared anything — a draft hasn't posted, so
  // its links are re-checked against what's left when it's confirmed.
  const linkedByTxn = new Map<string, number>();
  for (const ids of chunk(rows.map((row) => row.id))) {
    const { data, error } = await supabase
      .from("product_sale_items")
      .select("linked_count_txn_id, linked_quantity, quantity, product_sales!inner(status)")
      .eq("product_sales.status", "confirmed")
      .in("linked_count_txn_id", ids);
    if (error) throw error;
    for (const link of data ?? []) {
      if (!link.linked_count_txn_id) continue;
      const applied = Number(link.linked_quantity ?? link.quantity);
      linkedByTxn.set(link.linked_count_txn_id, (linkedByTxn.get(link.linked_count_txn_id) ?? 0) + applied);
    }
    // Stock-out lines assigned to a shortfall claim it too (they post as soon as they're saved).
    const { data: useLinks, error: useLinksError } = await supabase
      .from("retail_use_entries")
      .select("linked_count_txn_id, linked_quantity")
      .in("linked_count_txn_id", ids);
    if (useLinksError) throw useLinksError;
    for (const link of useLinks ?? []) {
      if (!link.linked_count_txn_id) continue;
      linkedByTxn.set(
        link.linked_count_txn_id,
        (linkedByTxn.get(link.linked_count_txn_id) ?? 0) + Number(link.linked_quantity ?? 0),
      );
    }
  }

  // Shortfall a removed receipt gave back (it was that receipt's units, not
  // usage) can't be claimed either — spread over that count item's rows.
  const givenBackByItem = new Map<string, number>();
  for (const ids of chunk(countItemIds)) {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("reference_id, quantity_change")
      .eq("reference_table", "inventory_count_items")
      .eq("notes", "Count true-up: removed receipt (offsets count shortfall)")
      .in("reference_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.reference_id) continue;
      givenBackByItem.set(row.reference_id, (givenBackByItem.get(row.reference_id) ?? 0) + Math.abs(Number(row.quantity_change)));
    }
  }
  for (const row of rows) {
    const givenBack = row.reference_id ? (givenBackByItem.get(row.reference_id) ?? 0) : 0;
    if (givenBack <= 0 || !row.reference_id) continue;
    const free = Math.max(0, Math.abs(Number(row.quantity_change)) - (linkedByTxn.get(row.id) ?? 0));
    const take = Math.min(free, givenBack);
    linkedByTxn.set(row.id, (linkedByTxn.get(row.id) ?? 0) + take);
    givenBackByItem.set(row.reference_id, givenBack - take);
  }

  return rows
    .flatMap((row) => {
      const count = row.reference_id ? countByItem.get(row.reference_id) : undefined;
      if (count?.status === "voided") return [];
      const shortfall = Math.abs(Number(row.quantity_change));
      const linked = linkedByTxn.get(row.id) ?? 0;
      const product = firstOf(row.products as { sku: string | null; name: string | null; order_name: string } | null);
      return [
        {
          txnId: row.id,
          productId: row.product_id,
          productLabel: productDisplayName(product) || product?.sku || "—",
          sku: product?.sku ?? null,
          countId: count?.countId ?? null,
          countDate: count?.countDate ?? null,
          shortfall,
          linked,
          remaining: Math.max(0, shortfall - linked),
          unitCost: Number(row.unit_cost ?? 0),
          storeLocationId: row.store_location_id,
          txnDate: row.txn_date,
        },
      ];
    })
    .sort((left, right) => (right.countDate ?? "").localeCompare(left.countDate ?? ""));
}

export async function getProductSales(supabase: Client, companyId: string, branchId: string) {
  const { data: sales, error } = await supabase
    .from("product_sales")
    .select("id, sale_date, notes, keyed_in_by, created_at, status")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = sales ?? [];
  if (list.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("product_sale_items")
    .select("product_sale_id, quantity, line_total")
    .in(
      "product_sale_id",
      list.map((sale) => sale.id),
    );
  if (itemsError) throw itemsError;

  const totals = new Map<string, { lineCount: number; totalQuantity: number; totalSales: number }>();
  for (const item of items ?? []) {
    const current = totals.get(item.product_sale_id) ?? { lineCount: 0, totalQuantity: 0, totalSales: 0 };
    current.lineCount += 1;
    current.totalQuantity += Number(item.quantity ?? 0);
    current.totalSales += Number(item.line_total ?? 0);
    totals.set(item.product_sale_id, current);
  }

  return list.map((sale) => ({
    ...sale,
    lineCount: totals.get(sale.id)?.lineCount ?? 0,
    totalQuantity: totals.get(sale.id)?.totalQuantity ?? 0,
    totalSales: totals.get(sale.id)?.totalSales ?? 0,
  }));
}

export async function getProductSale(supabase: Client, companyId: string, branchId: string, id: string) {
  const { data: sale, error } = await supabase
    .from("product_sales")
    .select("id, sale_date, notes, keyed_in_by, created_at, status")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: items, error: itemsError } = await supabase
    .from("product_sale_items")
    .select(
      "id, product_id, quantity, unit_sale_price, line_total, sale_date, linked_count_txn_id, linked_quantity, products(sku, name, order_name, size_label)",
    )
    .eq("product_sale_id", id)
    .order("created_at")
    .order("id");
  if (itemsError) throw itemsError;
  const list = items ?? [];

  // The cost a line was booked at lives on its retail_use ledger rows, not on
  // the sale line: unit_cost there is the point-in-time average that
  // fn_recompute_branch_cost keeps up to date, i.e. what Cost of retail uses.
  // A bundle line has one row per component, so this sums them all. Only
  // the retail_use rows count — a linked line also has a reclassification
  // row, which cancels part of a count shortfall rather than costing the sale.
  const costByItem = new Map<string, number>();
  if (list.length > 0) {
    const { data: ledgerRows, error: ledgerError } = await supabase
      .from("inventory_transactions")
      .select("reference_id, quantity_change, unit_cost")
      .eq("reference_table", "product_sale_items")
      .eq("txn_type", "retail_use")
      .in(
        "reference_id",
        list.map((item) => item.id),
      );
    if (ledgerError) throw ledgerError;
    for (const row of ledgerRows ?? []) {
      if (!row.reference_id) continue;
      const cost = Math.abs(Number(row.quantity_change)) * Number(row.unit_cost ?? 0);
      costByItem.set(row.reference_id, (costByItem.get(row.reference_id) ?? 0) + cost);
    }
  }

  const linkedTxnIds = [...new Set(list.map((item) => item.linked_count_txn_id).filter(Boolean))] as string[];
  const shortfalls = await getCountShortfalls(supabase, companyId, branchId, { txnIds: linkedTxnIds });
  const shortfallByTxn = new Map(shortfalls.map((shortfall) => [shortfall.txnId, shortfall]));

  return {
    ...sale,
    items: list.map((item) => {
      const quantity = Number(item.quantity);
      const totalCost = costByItem.get(item.id) ?? 0;
      const linked = item.linked_count_txn_id ? shortfallByTxn.get(item.linked_count_txn_id) : undefined;
      return {
        ...item,
        unitCost: quantity > 0 ? totalCost / quantity : 0,
        linkedCount: linked
          ? {
              countId: linked.countId,
              countDate: linked.countDate,
              shortfall: linked.shortfall,
              applied: Number(item.linked_quantity ?? item.quantity),
            }
          : null,
      };
    }),
  };
}

/**
 * Sales value per product sold this calendar month (Singapore time) at this
 * salon, from confirmed product sales, by each line's own sale date. A
 * bundle's sales stay on the bundle (it's what was sold), even though its
 * stock use lands on its components.
 */
export async function getMonthToDateSalesByProduct(
  supabase: Client,
  companyId: string,
  branchId: string,
  /** "YYYY-MM" months to cover, inclusive, instead of this month so far. */
  range?: { from: string; to: string },
) {
  const currentMonth = singaporeToday().slice(0, 7);
  const monthStart = `${range?.from ?? currentMonth}-01`;
  const monthEnd = `${shiftMonth(range?.to ?? currentMonth, 1)}-01`;
  const sales = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_sale_items")
      .select("id, product_id, line_total, product_sales!inner(company_id, branch_id, status)")
      .eq("product_sales.company_id", companyId)
      .eq("product_sales.branch_id", branchId)
      .eq("product_sales.status", "confirmed")
      .gte("sale_date", monthStart)
      .lt("sale_date", monthEnd)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      sales.set(row.product_id, (sales.get(row.product_id) ?? 0) + Number(row.line_total ?? 0));
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return sales;
}
