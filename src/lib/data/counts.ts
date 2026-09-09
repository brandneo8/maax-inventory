import type { createClient } from "@/lib/supabase/server";
import type { ProductClassification } from "@/lib/labels";
import { normalizeSearchText } from "@/lib/search";

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
        "id, product_id, store_location_id, expected_quantity, counted_quantity, variance, notes, products(sku, name, order_name, size_label, brand_sub, brands(name)), store_locations(name)",
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
      .select("id, inventory_count_id, inventory_count_item_id, quantity_delta, created_at, created_by")
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

export type CountCatalogHit = {
  productId: string;
  orderName: string;
  name: string;
  sku: string;
  brand: string;
  expected: number;
};

function likeNeedle(raw: string) {
  return normalizeSearchText(raw).replace(/ /g, "%").slice(0, 80);
}

export async function countLocationId(
  supabase: Client,
  branchId: string,
  storeLocationId: string | null,
) {
  if (storeLocationId) return storeLocationId;
  const { data, error } = await supabase.from("store_locations").select("id").eq("branch_id", branchId).limit(1);
  if (error) throw queryError(error, "Could not load storage locations.");
  const id = data?.[0]?.id;
  if (!id) throw new Error("This salon has no storage locations. Add a location before counting.");
  return id;
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
  const like = `%${needle}%`;

  const onCount = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .select("product_id")
      .eq("inventory_count_id", countId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw queryError(error, "Could not load count lines.");
    for (const row of data ?? []) onCount.add(row.product_id);
    if (!data || data.length < PAGE_SIZE) break;
  }

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

  const { data: named, error: namedError } = await supabase
    .from("products")
    .select("id, sku, name, order_name, brands(name)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .or(`name.ilike.${like},order_name.ilike.${like},sku.ilike.${like}`)
    .limit(20);
  if (namedError) throw queryError(namedError, "Could not search products.");

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
            .limit(20)
        ).data ?? [];

  const found = new Map<string, (typeof named extends (infer T)[] | null ? T : never)>();
  for (const product of [...(named ?? []), ...byBrand]) {
    if (!product || onCount.has(product.id) || assigned.has(product.id)) continue;
    found.set(product.id, product);
  }

  const hits = [...found.values()].slice(0, 8);
  if (hits.length === 0) return [];

  const locationId = await countLocationId(
    supabase,
    branchId,
    (
      await supabase
        .from("inventory_counts")
        .select("store_location_id")
        .eq("id", countId)
        .maybeSingle()
    ).data?.store_location_id ?? null,
  );

  const stockMap = new Map<string, number>();
  const { data: stock, error: stockError } = await supabase
    .from("current_stock")
    .select("product_id, quantity_on_hand")
    .eq("store_location_id", locationId)
    .in(
      "product_id",
      hits.map((hit) => hit.id),
    );
  if (stockError) throw queryError(stockError, "Could not load on-hand quantities.");
  for (const row of stock ?? []) {
    if (row.product_id) stockMap.set(row.product_id, Number(row.quantity_on_hand ?? 0));
  }

  return hits.map((product) => {
    const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands;
    return {
      productId: product.id,
      orderName: product.order_name?.trim() ?? "",
      name: product.name?.trim() ?? "",
      sku: product.sku?.trim() ?? "",
      brand: brand?.name?.trim() ?? "",
      expected: stockMap.get(product.id) ?? 0,
    };
  });
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
    storeLocationId: string;
    quantityDelta: number;
    createdBy: string | null;
  },
) {
  const { data: itemRow, error } = await supabase
    .from("inventory_count_items")
    .select("id, counted_quantity")
    .eq("inventory_count_id", args.countId)
    .eq("product_id", args.productId)
    .eq("store_location_id", args.storeLocationId)
    .maybeSingle();
  if (error) throw queryError(error, "Could not find that count line.");
  let item = itemRow;
  if (!item) {
    const { data: stock, error: stockError } = await supabase
      .from("current_stock")
      .select("quantity_on_hand")
      .eq("product_id", args.productId)
      .eq("store_location_id", args.storeLocationId)
      .maybeSingle();
    if (stockError) throw queryError(stockError, "Could not load on-hand for that location.");
    const { data: created, error: createError } = await supabase
      .from("inventory_count_items")
      .insert({
        inventory_count_id: args.countId,
        product_id: args.productId,
        store_location_id: args.storeLocationId,
        expected_quantity: Number(stock?.quantity_on_hand ?? 0),
      })
      .select("id, counted_quantity")
      .single();
    if (createError || !created) throw queryError(createError, "Could not add that location to this count.");
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
      if (error) throw queryError(error, "Could not count remaining lines as 0.");
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
    if (error) throw queryError(error, "Could not keep the expected quantity on remaining lines.");
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
      if (error) throw queryError(error, "Could not keep the expected quantity on remaining lines.");
    }
  }
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

