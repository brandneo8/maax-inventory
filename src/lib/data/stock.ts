import type { createClient } from "@/lib/supabase/server";
import { productDisplayName } from "@/lib/format";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getSalonStockReport(supabase: Client, companyId: string, branchId: string) {
  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) {
    return { salonStock: [] as SalonStockRow[], lowStock: [] as LowStockRow[] };
  }

  const { data: stockRows, error: stockError } = await supabase
    .from("current_stock")
    .select("product_id, quantity_on_hand")
    .in("store_location_id", locationIds)
    .gt("quantity_on_hand", 0);
  if (stockError) throw stockError;

  const qtyByProduct = new Map<string, number>();
  for (const row of stockRows ?? []) {
    if (!row.product_id) continue;
    qtyByProduct.set(row.product_id, (qtyByProduct.get(row.product_id) ?? 0) + Number(row.quantity_on_hand));
  }

  const stockIds = [...qtyByProduct.keys()];
  const [{ data: named }, { data: watched, error: watchedError }] = await Promise.all([
    stockIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; sku: string | null; name: string | null; order_name: string | null }[] })
      : supabase.from("products").select("id, sku, name, order_name").in("id", stockIds),
    supabase
      .from("products")
      .select("id, sku, name, order_name, low_stock_threshold")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .not("low_stock_threshold", "is", null),
  ]);
  if (watchedError) throw watchedError;

  const productMap = new Map((named ?? []).map((product) => [product.id, product]));
  const salonStock = stockIds
    .map((productId) => {
      const product = productMap.get(productId);
      return {
        productId,
        sku: product?.sku ?? undefined,
        name: productDisplayName(product) || undefined,
        quantity: qtyByProduct.get(productId) ?? 0,
      };
    })
    .filter((row) => row.quantity > 0);

  const lowStock = (watched ?? [])
    .map((product) => {
      const onHand = qtyByProduct.get(product.id) ?? 0;
      return {
        id: product.id,
        sku: product.sku,
        name: productDisplayName(product),
        onHand,
        threshold: Number(product.low_stock_threshold),
      };
    })
    .filter((row) => row.threshold != null && row.onHand <= row.threshold);

  return { salonStock, lowStock };
}

type SalonStockRow = {
  productId: string;
  sku: string | undefined;
  name: string | undefined;
  quantity: number;
};

type LowStockRow = {
  id: string;
  sku: string | null;
  name: string;
  onHand: number;
  threshold: number;
};

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

export async function getRecentMovements(supabase: Client, companyId: string, branchId: string) {
  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id, name")
    .eq("branch_id", branchId);

  if (locationError) throw locationError;
  const locationIds = (locations ?? []).map((location) => location.id);
  if (locationIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("inventory_transactions")
    .select("id, txn_type, quantity_change, txn_date, notes, product_id, store_location_id, reference_table, reference_id")
    .eq("company_id", companyId)
    .in("store_location_id", locationIds)
    .order("txn_date", { ascending: false })
    .limit(40);

  if (error) throw error;
  if (!rows?.length) return [];

  const productIds = [...new Set(rows.map((row) => row.product_id))];
  const receiptIds = rows
    .filter((row) => row.reference_table === "goods_receipt_items" && row.reference_id)
    .map((row) => row.reference_id as string);

  const [{ data: products }, { data: receipts }] = await Promise.all([
    supabase.from("products").select("id, sku, name, order_name").in("id", productIds),
    receiptIds.length
      ? supabase.from("goods_receipt_items").select("id, unit_cost").in("id", receiptIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const locationMap = new Map((locations ?? []).map((location) => [location.id, location]));
  const costMap = new Map((receipts ?? []).map((item) => [item.id, Number(item.unit_cost)]));

  return rows.map((row) => {
    const product = productMap.get(row.product_id);
    const unitCost = row.reference_id ? costMap.get(row.reference_id) : undefined;
    return {
      id: row.id,
      txn_type: row.txn_type,
      quantity_change: row.quantity_change,
      txn_date: row.txn_date,
      notes: row.notes,
      sku: product?.sku,
      name: productDisplayName(product),
      location_name: locationMap.get(row.store_location_id)?.name,
      unit_cost: unitCost,
      movement_value:
        unitCost === undefined ? null : Number(row.quantity_change) * unitCost,
    };
  });
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
