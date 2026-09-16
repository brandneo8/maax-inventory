import type { createClient } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/format";
import type { InventoryTxnType } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export const MOVEMENT_PAGE_SIZE = 100;

export type MovementFilters = {
  query?: string;
  txnType?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type MovementRow = {
  id: string;
  txnType: string;
  quantityChange: number;
  txnDate: string;
  notes: string | null;
  unitCost: number | null;
  classification: string | null;
  sku: string | null;
  productName: string;
  sizeLabel: string | null;
  locationName: string | null;
  reference: { label: string; href?: string } | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** The full inventory ledger for a branch — every stock-moving transaction, paginated and filterable. */
export async function getInventoryMovements(
  supabase: Client,
  companyId: string,
  branchId: string,
  filters: MovementFilters,
  page: number,
): Promise<{ rows: MovementRow[]; total: number }> {
  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id, name")
    .eq("branch_id", branchId);
  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return { rows: [], total: 0 };

  let productIdFilter: string[] | null = null;
  const needle = filters.query?.trim();
  if (needle) {
    const { data: matches, error: matchError } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .or(`name.ilike.%${needle}%,order_name.ilike.%${needle}%,sku.ilike.%${needle}%`);
    if (matchError) throw matchError;
    productIdFilter = (matches ?? []).map((product) => product.id);
    if (productIdFilter.length === 0) return { rows: [], total: 0 };
  }

  let query = supabase
    .from("inventory_transactions")
    .select(
      "id, txn_type, quantity_change, txn_date, notes, unit_cost, classification, product_id, store_location_id, reference_table, reference_id",
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .in("store_location_id", locationIds)
    .order("txn_date", { ascending: false })
    .order("id", { ascending: false })
    .range(page * MOVEMENT_PAGE_SIZE, page * MOVEMENT_PAGE_SIZE + MOVEMENT_PAGE_SIZE - 1);

  if (filters.txnType) query = query.eq("txn_type", filters.txnType as InventoryTxnType);
  if (filters.dateFrom) query = query.gte("txn_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("txn_date", `${filters.dateTo}T23:59:59.999Z`);
  if (productIdFilter) query = query.in("product_id", productIdFilter);

  const { data: rows, error, count } = await query;
  if (error) throw error;
  if (!rows?.length) return { rows: [], total: count ?? 0 };

  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, sku, name, order_name, size_label")
    .in("id", productIds);
  if (productsError) throw productsError;
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const locationMap = new Map((locations ?? []).map((location) => [location.id, location]));

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

  const mapped: MovementRow[] = rows.map((row) => {
    const product = productMap.get(row.product_id);
    let reference: MovementRow["reference"] = null;

    if (row.reference_table === "goods_receipt_items" && row.reference_id) {
      const item = receiptMap.get(row.reference_id) as
        | { goods_receipts: { purchase_order_id: string | null; purchase_orders: unknown } | null }
        | undefined;
      const receipt = firstOf(item?.goods_receipts ?? null);
      const po = firstOf((receipt?.purchase_orders as { po_number: string } | { po_number: string }[]) ?? null);
      reference = po?.po_number
        ? { label: po.po_number, href: receipt?.purchase_order_id ? `/orders/${receipt.purchase_order_id}` : undefined }
        : { label: "Purchase order" };
    } else if (row.reference_table === "inventory_count_items" && row.reference_id) {
      const item = countItemMap.get(row.reference_id) as
        | { inventory_count_id: string; inventory_counts: unknown }
        | undefined;
      const inventoryCount = firstOf((item?.inventory_counts as { count_date: string } | { count_date: string }[]) ?? null);
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
      unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
      classification: row.classification,
      sku: product?.sku ?? null,
      productName: productDisplayName(product) || product?.sku || "—",
      sizeLabel: product?.size_label ?? null,
      locationName: locationMap.get(row.store_location_id)?.name ?? null,
      reference,
    };
  });

  return { rows: mapped, total: count ?? 0 };
}
