import type { createClient } from "@/lib/supabase/server";

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
    supabase.from("products").select("id, sku, name").in("id", productIds),
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
      name: row.product_id ? productMap.get(row.product_id)?.name : undefined,
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
