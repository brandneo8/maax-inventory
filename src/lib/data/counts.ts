import type { ProductClassification } from "@/lib/labels";
import { normalizeSearchText } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

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
      "id, status, count_date, counted_by, brands(name), tags(name), filter_classification",
    )
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw queryError(error, "Could not load counts.");
  const counts = data ?? [];
  if (counts.length === 0) return [];

  const totals = new Map<string, { countedQuantity: number; uniqueSkus: number }>();
  const skuSets = new Map<string, Set<string>>();
  for (const ids of chunkList(counts.map((count) => count.id))) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: items, error: itemsError } = await supabase
        .from("inventory_count_items")
        .select("inventory_count_id, product_id, counted_quantity")
        .in("inventory_count_id", ids)
        .not("counted_quantity", "is", null)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (itemsError) throw queryError(itemsError, "Could not load count totals.");
      for (const item of items ?? []) {
        const current = totals.get(item.inventory_count_id) ?? { countedQuantity: 0, uniqueSkus: 0 };
        current.countedQuantity += Number(item.counted_quantity ?? 0);
        totals.set(item.inventory_count_id, current);
        const skus = skuSets.get(item.inventory_count_id) ?? new Set<string>();
        skus.add(item.product_id);
        skuSets.set(item.inventory_count_id, skus);
      }
      if (!items || items.length < PAGE_SIZE) break;
    }
  }

  return counts.map((count) => ({
    ...count,
    countedQuantity: totals.get(count.id)?.countedQuantity ?? 0,
    uniqueSkus: skuSets.get(count.id)?.size ?? 0,
  }));
}

export async function getInventoryCount(supabase: Client, companyId: string, id: string, branchId: string) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, status, count_date, counted_by, filter_brand_id, filter_classification, filter_tag_id, brands(name), tags(name)",
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
        "id, product_id, expected_quantity, counted_quantity, variance, notes, products(sku, name, order_name, size_label, brand_sub, brands(name))",
      )
      .eq("inventory_count_id", id)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (itemsError) throw queryError(itemsError, "Could not load count lines.");
    items.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const entries = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: entriesError } = await supabase
      .from("inventory_count_entries")
      .select(
        "id, inventory_count_id, inventory_count_item_id, quantity_delta, created_at, created_by",
      )
      .eq("inventory_count_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (entriesError) throw queryError(entriesError, "Could not load count transactions.");
    entries.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  return { ...data, items, entries };
}

export async function resolveCountItems(
  supabase: Client,
  companyId: string,
  branchId: string,
  filters: {
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

  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("branch_id", branchId);
  if (locationError) throw queryError(locationError, "Could not load storage locations.");
  const locationIds = (locations ?? []).map((location) => location.id);

  if (locationIds.length === 0) {
    throw new Error("This salon isn’t set up for stock yet.");
  }
  if (scopedIds.length === 0) {
    throw new Error("No products on this salon match those count filters.");
  }

  const stockMap = await salonStockByProduct(supabase, locationIds, scopedIds);

  return scopedIds.map((productId) => ({
    product_id: productId,
    expected_quantity: stockMap.get(productId) ?? 0,
  }));
}

async function salonStockByProduct(supabase: Client, locationIds: string[], productIds: string[]) {
  const stockMap = new Map<string, number>();
  if (locationIds.length === 0 || productIds.length === 0) return stockMap;
  for (const ids of chunkList(productIds)) {
    const { data: stock, error: stockError } = await supabase
      .from("current_stock")
      .select("product_id, quantity_on_hand")
      .in("product_id", ids)
      .in("store_location_id", locationIds);
    if (stockError) throw queryError(stockError, "Could not load on-hand quantities.");
    for (const row of stock ?? []) {
      if (!row.product_id) continue;
      stockMap.set(row.product_id, (stockMap.get(row.product_id) ?? 0) + Number(row.quantity_on_hand ?? 0));
    }
  }
  return stockMap;
}

async function branchLocationIds(supabase: Client, branchId: string) {
  const { data, error } = await supabase.from("store_locations").select("id").eq("branch_id", branchId);
  if (error) throw queryError(error, "Could not load storage locations.");
  return (data ?? []).map((location) => location.id);
}

export type CountCatalogHit = {
  productId: string;
  orderName: string;
  name: string;
  sku: string;
  brand: string;
  expected: number;
  onCount: boolean;
  onSalon: boolean;
};

function likeNeedle(raw: string) {
  return normalizeSearchText(raw).replace(/ /g, "%").slice(0, 80);
}

function catalogDb(fallback: Client) {
  try {
    return createAdminClient();
  } catch {
    return fallback;
  }
}

export async function searchCatalogForCount(
  supabase: Client,
  companyId: string,
  branchId: string,
  countId: string,
  query: string,
) {
  const needle = likeNeedle(query);
  if (needle.length < 2) return [] as CountCatalogHit[];
  const db = catalogDb(supabase);

  const { data: rpcHits, error: rpcError } = await db.rpc("search_products_for_count", {
    p_company_id: companyId,
    p_branch_id: branchId,
    p_needle: needle,
    p_limit: 8,
  });
  let hits = rpcHits ?? [];
  if (rpcError) {
    hits = await searchCatalogFallback(db, companyId, branchId, needle);
  }
  if (hits.length === 0) return [];
  const hitIds = hits.map((hit) => hit.id);

  const onCount = new Set<string>();
  const { data: countRows } = await db
    .from("inventory_count_items")
    .select("product_id")
    .eq("inventory_count_id", countId)
    .in("product_id", hitIds);
  for (const row of countRows ?? []) onCount.add(row.product_id);

  let stockMap = new Map<string, number>();
  try {
    const locationIds = await branchLocationIds(db as Client, branchId);
    stockMap = await salonStockByProduct(db as Client, locationIds, hitIds);
  } catch {
    stockMap = new Map();
  }

  return hits.map((product) => ({
    productId: product.id,
    orderName: product.order_name?.trim() ?? "",
    name: product.name?.trim() ?? "",
    sku: product.sku?.trim() ?? "",
    brand: product.brand_name?.trim() ?? "",
    expected: stockMap.get(product.id) ?? 0,
    onCount: onCount.has(product.id),
    onSalon: Boolean(product.on_salon),
  }));
}

function likeFilter(needle: string) {
  return `%${needle}%`;
}

async function searchCatalogFallback(
  supabase: Client | ReturnType<typeof createAdminClient>,
  companyId: string,
  branchId: string,
  needle: string,
) {
  const like = likeFilter(needle);
  const orFilter = [
    `name.ilike."${like}"`,
    `order_name.ilike."${like}"`,
    `sku.ilike."${like}"`,
    `brand_sub.ilike."${like}"`,
  ].join(",");

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

  const { data: brands, error: brandError } = await supabase
    .from("brands")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", like)
    .limit(20);
  if (brandError) throw queryError(brandError, "Could not search brands.");
  const brandIds = (brands ?? []).map((brand) => brand.id);

  function productQuery() {
    return supabase
      .from("products")
      .select("id, sku, name, order_name, brands(name)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or(orFilter);
  }

  const assignedList = [...assigned];
  const untaggedQuery =
    assignedList.length > 0
      ? productQuery().not("id", "in", `(${assignedList.join(",")})`).limit(8)
      : productQuery().limit(8);
  const taggedQuery =
    assignedList.length > 0
      ? productQuery().in("id", assignedList.slice(0, 200)).limit(8)
      : productQuery().limit(8);

  const [{ data: untagged, error: untaggedError }, { data: tagged, error: taggedError }] = await Promise.all([
    untaggedQuery,
    taggedQuery,
  ]);
  if (untaggedError) throw queryError(untaggedError, "Could not search products.");
  if (taggedError) throw queryError(taggedError, "Could not search products.");

  const byBrand =
    brandIds.length === 0
      ? []
      : (
          await supabase
            .from("products")
            .select("id, sku, name, order_name, brands(name)")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .in("brand_id", brandIds)
            .limit(40)
        ).data ?? [];

  function toHit(
    product: {
      id: string;
      sku: string | null;
      name: string | null;
      order_name: string | null;
      brands: unknown;
    },
    onSalon: boolean,
  ) {
    const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands;
    const brandName =
      brand && typeof brand === "object" && brand && "name" in brand
        ? String((brand as { name?: string | null }).name ?? "").trim()
        : "";
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      order_name: product.order_name,
      brand_name: brandName,
      on_salon: onSalon,
    };
  }

  const seen = new Set<string>();
  const hits: ReturnType<typeof toHit>[] = [];
  for (const product of untagged ?? []) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    hits.push(toHit(product, false));
  }
  for (const product of byBrand) {
    if (seen.has(product.id) || assigned.has(product.id)) continue;
    seen.add(product.id);
    hits.push(toHit(product, false));
    if (hits.filter((hit) => !hit.on_salon).length >= 8) break;
  }
  for (const product of tagged ?? []) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    hits.push(toHit(product, true));
  }
  return hits.slice(0, 16);
}

export async function assignProductsToSalon(supabase: Client, branchId: string, productIds: string[]) {
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return;
  const existing = new Set<string>();
  for (const ids of chunkList(wanted)) {
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branchId)
      .in("product_id", ids);
    if (error) throw queryError(error, "Could not check salon product lists.");
    for (const row of data ?? []) existing.add(row.product_id);
  }
  const missing = wanted.filter((id) => !existing.has(id));
  if (missing.length === 0) return;
  for (const ids of chunkList(missing)) {
    const { error } = await supabase.from("product_branches").insert(
      ids.map((productId) => ({ product_id: productId, branch_id: branchId })),
    );
    if (error) throw queryError(error, "Could not add counted products to this salon.");
  }
}

export async function addCountEntry(
  supabase: Client,
  args: {
    countId: string;
    productId: string;
    quantityDelta: number;
    createdBy: string | null;
    branchId: string;
  },
) {
  const { data: itemRow, error } = await supabase
    .from("inventory_count_items")
    .select("id, counted_quantity")
    .eq("inventory_count_id", args.countId)
    .eq("product_id", args.productId)
    .maybeSingle();
  if (error) throw queryError(error, "Could not find that count line.");
  let item = itemRow;
  if (!item) {
    const locationIds = await branchLocationIds(supabase, args.branchId);
    const stockMap = await salonStockByProduct(supabase, locationIds, [args.productId]);
    const { data: created, error: createError } = await supabase
      .from("inventory_count_items")
      .insert({
        inventory_count_id: args.countId,
        product_id: args.productId,
        store_location_id: null,
        expected_quantity: stockMap.get(args.productId) ?? 0,
      })
      .select("id, counted_quantity")
      .single();
    if (createError || !created) throw queryError(createError, "Could not add that product to this count.");
    item = created;
  }

  const next = Number(item.counted_quantity ?? 0) + args.quantityDelta;
  if (next < 0) {
    throw new Error(
      `Cannot deduct ${Math.abs(args.quantityDelta)}. Counted is ${Number(item.counted_quantity ?? 0)}.`,
    );
  }

  const { error: insertError } = await supabase.from("inventory_count_entries").insert({
    inventory_count_id: args.countId,
    inventory_count_item_id: item.id,
    store_location_id: null,
    quantity_delta: args.quantityDelta,
    created_by: args.createdBy,
  });
  if (insertError) throw queryError(insertError, "Could not save that count.");

  const { error: updateError } = await supabase
    .from("inventory_count_items")
    .update({ counted_quantity: next })
    .eq("id", item.id);
  if (updateError) throw queryError(updateError, "Could not update the counted total.");
}

export async function setCountedQuantities(
  supabase: Client,
  countId: string,
  updates: { id: string; counted: number }[],
  createdBy: string | null,
) {
  if (updates.length === 0) return;

  const current = new Map<string, number | null>();
  for (const ids of chunkList(updates.map((update) => update.id))) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id, counted_quantity")
      .eq("inventory_count_id", countId)
      .in("id", ids);
    if (error) throw queryError(error, "Could not load count lines.");
    for (const row of data ?? []) current.set(row.id, row.counted_quantity);
  }

  for (const update of updates) {
    if (!current.has(update.id)) continue;
    const previous = current.get(update.id);
    const previousAmount = previous === null || previous === undefined ? 0 : Number(previous);
    if (previous !== null && previous !== undefined && previousAmount === update.counted) continue;

    const delta = update.counted - previousAmount;
    if (delta !== 0) {
      const { error: insertError } = await supabase.from("inventory_count_entries").insert({
        inventory_count_id: countId,
        inventory_count_item_id: update.id,
        quantity_delta: delta,
        created_by: createdBy,
      });
      if (insertError) throw queryError(insertError, "Could not save that count adjustment.");
    }

    const { error: updateError } = await supabase
      .from("inventory_count_items")
      .update({ counted_quantity: update.counted })
      .eq("id", update.id)
      .eq("inventory_count_id", countId);
    if (updateError) throw queryError(updateError, "Could not save counted quantities.");
  }
}

export async function fillUncountedItems(
  supabase: Client,
  countId: string,
  mode: "zero" | "keep",
  itemIds: string[] = [],
) {
  const wanted = [...new Set(itemIds.filter(Boolean))];
  if (wanted.length === 0) return;

  if (mode === "zero") {
    for (const ids of chunkList(wanted)) {
      const { error } = await supabase
        .from("inventory_count_items")
        .update({ counted_quantity: 0 })
        .eq("inventory_count_id", countId)
        .in("id", ids);
      if (error) throw queryError(error, "Could not count remaining products as 0.");
    }
    return;
  }

  const items: { id: string; expected_quantity: number | null }[] = [];
  for (const ids of chunkList(wanted)) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id, expected_quantity")
      .eq("inventory_count_id", countId)
      .in("id", ids);
    if (error) throw queryError(error, "Could not keep the expected quantity on remaining products.");
    items.push(...(data ?? []));
  }

  const byExpected = new Map<number, string[]>();
  for (const item of items) {
    const expected = Number(item.expected_quantity ?? 0);
    const list = byExpected.get(expected) ?? [];
    list.push(item.id);
    byExpected.set(expected, list);
  }
  for (const [expected, ids] of byExpected) {
    for (const chunk of chunkList(ids)) {
      const { error } = await supabase
        .from("inventory_count_items")
        .update({ counted_quantity: expected })
        .eq("inventory_count_id", countId)
        .in("id", chunk);
      if (error) throw queryError(error, "Could not keep the expected quantity on remaining products.");
    }
  }
}

export async function getScannedProductIds(supabase: Client, countId: string) {
  const itemIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventory_count_entries")
      .select("inventory_count_item_id")
      .eq("inventory_count_id", countId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw queryError(error, "Could not load counted products.");
    for (const row of data ?? []) itemIds.add(row.inventory_count_item_id);
    if (!data || data.length < PAGE_SIZE) break;
  }

  const scanned = new Set<string>();
  if (itemIds.size === 0) return scanned;
  for (const ids of chunkList([...itemIds])) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("product_id")
      .in("id", ids);
    if (error) throw queryError(error, "Could not load counted products.");
    for (const row of data ?? []) scanned.add(row.product_id);
  }
  return scanned;
}

export async function getSalonProductIds(
  supabase: Client,
  branchId: string,
  productIds: string[],
) {
  const assigned = new Set<string>();
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return assigned;
  for (const ids of chunkList(wanted)) {
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branchId)
      .in("product_id", ids);
    if (error) throw queryError(error, "Could not load the salon product list.");
    for (const row of data ?? []) assigned.add(row.product_id);
  }
  return assigned;
}

export async function syncProductSalonMembership(
  supabase: Client,
  branchId: string,
  productIds: string[],
  keepOnSalon: Set<string>,
) {
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return;
  const drop = wanted.filter((productId) => !keepOnSalon.has(productId));
  const keep = wanted.filter((productId) => keepOnSalon.has(productId));

  for (const ids of chunkList(drop)) {
    const { error } = await supabase
      .from("product_branches")
      .delete()
      .eq("branch_id", branchId)
      .in("product_id", ids);
    if (error) throw queryError(error, "Could not drop those products from this salon.");
  }

  await assignProductsToSalon(supabase, branchId, keep);
}

export async function getLatestPostedCountDate(
  supabase: Client,
  companyId: string,
  branchId: string,
) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("count_date")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("status", "completed")
    .order("count_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw queryError(error, "Could not load the latest confirmed count.");
  return data?.count_date ?? null;
}

export async function voidCompletedCount(
  supabase: Client,
  args: { companyId: string; countId: string; createdBy: string | null },
) {
  const itemIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("id")
      .eq("inventory_count_id", args.countId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw queryError(error, "Could not load count lines.");
    itemIds.push(...(data ?? []).map((item) => item.id));
    if (!data || data.length < PAGE_SIZE) break;
  }

  if (itemIds.length > 0) {
    const posted: {
      product_id: string;
      store_location_id: string;
      quantity_change: number;
      reference_id: string | null;
    }[] = [];
    for (const ids of chunkList(itemIds)) {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("product_id, store_location_id, quantity_change, reference_id")
        .eq("company_id", args.companyId)
        .eq("txn_type", "count_adjustment")
        .eq("reference_table", "inventory_count_items")
        .eq("notes", "Count variance")
        .in("reference_id", ids);
      if (error) throw queryError(error, "Could not load posted count adjustments.");
      posted.push(...(data ?? []));
    }

    for (const batch of chunkList(posted.filter((row) => Number(row.quantity_change) !== 0))) {
      const { error } = await supabase.from("inventory_transactions").insert(
        batch.map((row) => ({
          company_id: args.companyId,
          product_id: row.product_id,
          store_location_id: row.store_location_id,
          txn_type: "count_adjustment" as const,
          quantity_change: -Number(row.quantity_change),
          reference_table: "inventory_count_items",
          reference_id: row.reference_id,
          created_by: args.createdBy,
          notes: "Voided count",
        })),
      );
      if (error) throw queryError(error, "Could not reverse posted count adjustments.");
    }
  }

  const { error: statusError } = await supabase
    .from("inventory_counts")
    .update({ status: "voided" })
    .eq("id", args.countId)
    .eq("status", "completed");
  if (statusError) throw queryError(statusError, "Could not void the count.");
}

