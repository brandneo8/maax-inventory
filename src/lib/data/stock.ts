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
