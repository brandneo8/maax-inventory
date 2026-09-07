import type { createClient } from "@/lib/supabase/server";
import type { ProductClassification } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getInventoryCounts(supabase: Client, companyId: string, branchId: string) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, status, count_date, counted_by, store_locations(name), brands(name), tags(name), filter_classification",
    )
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getInventoryCount(supabase: Client, companyId: string, id: string, branchId: string) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, status, count_date, counted_by, store_location_id, filter_brand_id, filter_classification, filter_tag_id, store_locations(name), brands(name), tags(name)",
    )
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("id", id)
    .single();

  if (error) throw error;

  const { data: items, error: itemsError } = await supabase
    .from("inventory_count_items")
    .select(
      "id, product_id, store_location_id, expected_quantity, counted_quantity, variance, notes, products(sku, name, order_name), store_locations(name)",
    )
    .eq("inventory_count_id", id)
    .order("id");

  if (itemsError) throw itemsError;

  return { ...data, items: items ?? [] };
}

export async function resolveCountItems(
  supabase: Client,
  companyId: string,
  branchId: string,
  filters: {
    store_location_id: string | null;
    filter_brand_id: string | null;
    filter_classification: ProductClassification | null;
    filter_tag_id: string | null;
  },
) {
  let productQuery = supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (filters.filter_brand_id) {
    productQuery = productQuery.eq("brand_id", filters.filter_brand_id);
  }
  if (filters.filter_classification) {
    productQuery = productQuery.eq("default_classification", filters.filter_classification);
  }

  const { data: products, error: productError } = await productQuery;
  if (productError) throw productError;

  let productIds = (products ?? []).map((product) => product.id);

  if (filters.filter_tag_id) {
    const { data: tagged, error: tagError } = await supabase
      .from("product_tags")
      .select("product_id")
      .eq("tag_id", filters.filter_tag_id)
      .in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);

    if (tagError) throw tagError;
    const taggedSet = new Set((tagged ?? []).map((row) => row.product_id));
    productIds = productIds.filter((id) => taggedSet.has(id));
  }

  let locationQuery = supabase.from("store_locations").select("id").eq("branch_id", branchId);
  if (filters.store_location_id) {
    locationQuery = locationQuery.eq("id", filters.store_location_id);
  }

  const { data: locations, error: locationError } = await locationQuery;
  if (locationError) throw locationError;

  const locationIds = (locations ?? []).map((location) => location.id);
  if (productIds.length === 0 || locationIds.length === 0) {
    throw new Error("No products or locations match those count filters.");
  }

  const { data: stock, error: stockError } = await supabase
    .from("current_stock")
    .select("product_id, store_location_id, quantity_on_hand")
    .in("product_id", productIds)
    .in("store_location_id", locationIds);

  if (stockError) throw stockError;

  const stockMap = new Map(
    (stock ?? []).map((row) => [`${row.product_id}:${row.store_location_id}`, Number(row.quantity_on_hand ?? 0)]),
  );

  return productIds.flatMap((productId) =>
    locationIds.map((storeLocationId) => ({
      product_id: productId,
      store_location_id: storeLocationId,
      expected_quantity: stockMap.get(`${productId}:${storeLocationId}`) ?? 0,
    })),
  );
}
