import type { createClient } from "@/lib/supabase/server";
import type { ProductClassification } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

export function queryError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return new Error(error.message);
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

export function chunkList<T>(items: T[], size = IN_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function getInventoryCounts(supabase: Client, companyId: string, branchId: string) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, status, count_date, counted_by, store_locations(name), brands(name), tags(name), filter_classification",
    )
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw queryError(error, "Could not load counts.");
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

  if (error) throw queryError(error, "Count not found.");

  const items = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: itemsError } = await supabase
      .from("inventory_count_items")
      .select(
        "id, product_id, store_location_id, expected_quantity, counted_quantity, variance, notes, products(sku, name, order_name, brands(name)), store_locations(name)",
      )
      .eq("inventory_count_id", id)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (itemsError) throw queryError(itemsError, "Could not load count lines.");
    items.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  return { ...data, items };
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
  const assigned = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branchId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw queryError(error, "Could not load this salon’s product list.");
    for (const row of data ?? []) assigned.add(row.product_id);
    if (!data || data.length < PAGE_SIZE) break;
  }

  const productIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (filters.filter_brand_id) query = query.eq("brand_id", filters.filter_brand_id);
    if (filters.filter_classification) {
      query = query.eq("default_classification", filters.filter_classification);
    }
    const { data, error } = await query;
    if (error) throw queryError(error, "Could not load products for this count.");
    for (const product of data ?? []) {
      if (assigned.has(product.id)) productIds.push(product.id);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  let scopedIds = productIds;
  if (filters.filter_tag_id) {
    const tagged = new Set<string>();
    const lookupIds = scopedIds.length > 0 ? scopedIds : ["00000000-0000-0000-0000-000000000000"];
    for (const ids of chunkList(lookupIds)) {
      const { data, error } = await supabase
        .from("product_tags")
        .select("product_id")
        .eq("tag_id", filters.filter_tag_id)
        .in("product_id", ids);
      if (error) throw queryError(error, "Could not apply the tag filter.");
      for (const row of data ?? []) tagged.add(row.product_id);
    }
    scopedIds = scopedIds.filter((id) => tagged.has(id));
  }

  let locationQuery = supabase.from("store_locations").select("id").eq("branch_id", branchId);
  if (filters.store_location_id) locationQuery = locationQuery.eq("id", filters.store_location_id);
  const { data: locations, error: locationError } = await locationQuery;
  if (locationError) throw queryError(locationError, "Could not load storage locations.");
  const locationIds = (locations ?? []).map((location) => location.id);

  if (locationIds.length === 0) {
    throw new Error("This salon has no storage locations. Add a location before starting a count.");
  }
  if (scopedIds.length === 0) {
    throw new Error("No products on this salon match those count filters.");
  }

  const stockMap = new Map<string, number>();
  for (const ids of chunkList(scopedIds)) {
    const { data: stock, error: stockError } = await supabase
      .from("current_stock")
      .select("product_id, store_location_id, quantity_on_hand")
      .in("product_id", ids)
      .in("store_location_id", locationIds);
    if (stockError) throw queryError(stockError, "Could not load on-hand quantities.");
    for (const row of stock ?? []) {
      stockMap.set(`${row.product_id}:${row.store_location_id}`, Number(row.quantity_on_hand ?? 0));
    }
  }

  return scopedIds.flatMap((productId) =>
    locationIds.map((storeLocationId) => ({
      product_id: productId,
      store_location_id: storeLocationId,
      expected_quantity: stockMap.get(`${productId}:${storeLocationId}`) ?? 0,
    })),
  );
}
