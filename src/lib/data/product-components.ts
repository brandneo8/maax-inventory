import { bundleCostsComplete, inheritedUnitCost, roundMoney } from "@/lib/catalog-pricing";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type BundlePersistLine = {
  productId: string;
  quantity: number;
  allocatedCost?: number | null;
};

async function ensureBundleTag(supabase: Client, companyId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", "bundle")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("tags")
    .insert({ company_id: companyId, name: "Bundle" })
    .select("id")
    .single();
  if (!createError && created) return created.id;

  const { data: raced, error: racedError } = await supabase
    .from("tags")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", "bundle")
    .maybeSingle();
  if (racedError) throw new Error(racedError.message);
  if (!raced) throw new Error(createError?.message || "Could not create the Bundle tag.");
  return raced.id;
}

export async function syncBundleTag(
  supabase: Client,
  companyId: string,
  productId: string,
  isSet: boolean,
) {
  const tagId = await ensureBundleTag(supabase, companyId);
  if (isSet) {
    const { error } = await supabase
      .from("product_tags")
      .upsert({ product_id: productId, tag_id: tagId }, { onConflict: "product_id,tag_id" });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("product_tags").delete().eq("product_id", productId).eq("tag_id", tagId);
  if (error) throw new Error(error.message);
}

export type BundleComponent = { productId: string; quantity: number };

/**
 * The BOM for a bundle product, or an empty array if it isn't currently a
 * bundle (or has no components defined). Used to fan usage/receiving of the
 * bundle SKU out to its components — the bundle itself never carries its own
 * stock or cost, see fn_after_goods_receipt_item_insert.
 */
export async function getBundleComponents(supabase: Client, productId: string): Promise<BundleComponent[]> {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("is_set")
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product?.is_set) return [];

  const { data, error } = await supabase
    .from("product_components")
    .select("component_product_id, quantity")
    .eq("set_product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ productId: row.component_product_id, quantity: Number(row.quantity) }));
}

export type BundleMigratableStock = {
  quantity: number;
  value: number;
  locationCount: number;
};

/**
 * Preview of whatever stock/cost a bundle's parent SKU is still carrying from
 * before it became a bundle (receipts recorded while it was a plain product).
 * Returns null when there's nothing to migrate.
 */
export async function getBundleMigratableStock(
  supabase: Client,
  productId: string,
): Promise<BundleMigratableStock | null> {
  const { data: stock, error } = await supabase
    .from("current_stock")
    .select("store_location_id, quantity_on_hand")
    .eq("product_id", productId)
    .gt("quantity_on_hand", 0);
  if (error) throw new Error(error.message);
  if (!stock?.length) return null;

  const locationIds = [...new Set(stock.map((row) => row.store_location_id).filter(Boolean))] as string[];
  const { data: locations, error: locationError } = await supabase
    .from("store_locations")
    .select("id, branch_id")
    .in("id", locationIds);
  if (locationError) throw new Error(locationError.message);
  const branchByLocation = new Map((locations ?? []).map((location) => [location.id, location.branch_id]));

  const branchIds = [...new Set([...branchByLocation.values()])];
  const { data: costs, error: costError } = await supabase
    .from("product_branch_costs")
    .select("branch_id, avg_unit_cost")
    .eq("product_id", productId)
    .in("branch_id", branchIds);
  if (costError) throw new Error(costError.message);
  const costByBranch = new Map((costs ?? []).map((row) => [row.branch_id, Number(row.avg_unit_cost)]));

  let quantity = 0;
  let value = 0;
  for (const row of stock) {
    const branchId = row.store_location_id ? branchByLocation.get(row.store_location_id) : undefined;
    const avgCost = branchId ? (costByBranch.get(branchId) ?? 0) : 0;
    quantity += Number(row.quantity_on_hand);
    value += Number(row.quantity_on_hand) * avgCost;
  }

  if (quantity <= 0) return null;
  return { quantity, value: roundMoney(value), locationCount: stock.length };
}

export type BundleMigrationResult = {
  locationsMoved: number;
  quantityMoved: number;
  valueMoved: number;
};

/** Moves a bundle parent's remaining stock/cost into its components. See the migration comment on fn_migrate_bundle_stock_to_components. */
export async function migrateBundleStock(
  supabase: Client,
  companyId: string,
  productId: string,
): Promise<BundleMigrationResult | null> {
  const { data, error } = await supabase.rpc("fn_migrate_bundle_stock_to_components", {
    p_company_id: companyId,
    p_product_id: productId,
  });
  if (error) throw new Error(error.message || "Could not migrate existing stock.");
  return data as BundleMigrationResult | null;
}

export async function persistProductComponents(
  supabase: Client,
  companyId: string,
  input: {
    productId: string;
    isSet: boolean;
    parentUnitCost: number;
    components: BundlePersistLine[];
    replaceEmpty?: boolean;
  },
) {
  const { productId, isSet, parentUnitCost, replaceEmpty = false } = input;

  if (!isSet) {
    const { error } = await supabase.from("product_components").delete().eq("set_product_id", productId);
    if (error) throw new Error(error.message);
    await syncBundleTag(supabase, companyId, productId, false);
    return;
  }

  const wanted = [
    ...new Map(
      input.components
        .filter((item) => item.productId && item.productId !== productId && Number(item.quantity) > 0)
        .map((item) => [
          item.productId,
          {
            productId: item.productId,
            quantity: Number(item.quantity),
            allocatedCost: item.allocatedCost == null ? null : Number(item.allocatedCost),
          },
        ]),
    ).values(),
  ];

  if (wanted.length === 0) {
    if (!replaceEmpty) return;
    const { error } = await supabase.from("product_components").delete().eq("set_product_id", productId);
    if (error) throw new Error(error.message);
    return;
  }

  const allocated = wanted.map((item) => {
    if (wanted.length === 1 && (item.allocatedCost == null || !Number.isFinite(item.allocatedCost))) {
      return parentUnitCost;
    }
    return item.allocatedCost;
  });
  if (wanted.length > 1 && !bundleCostsComplete(parentUnitCost, allocated)) {
    throw new Error("Mixed bundles need a cost breakdown that adds up to the bundle unit cost.");
  }

  const { data: owned, error: ownedError } = await supabase
    .from("products")
    .select("id, is_set")
    .eq("company_id", companyId)
    .in(
      "id",
      wanted.map((item) => item.productId),
    );
  if (ownedError) throw new Error(ownedError.message);

  const allowed = new Map((owned ?? []).map((product) => [product.id, product]));
  const rows = wanted.flatMap((item, index) => {
    const product = allowed.get(item.productId);
    if (!product || product.is_set) return [];
    const share = allocated[index];
    return [
      {
        set_product_id: productId,
        component_product_id: item.productId,
        quantity: item.quantity,
        allocated_cost: share == null || !Number.isFinite(share) ? null : roundMoney(share),
      },
    ];
  });

  if (rows.length === 0) {
    if (!replaceEmpty) return;
    const { error } = await supabase.from("product_components").delete().eq("set_product_id", productId);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from("product_components")
    .select("component_product_id")
    .eq("set_product_id", productId);
  if (existingError) throw new Error(existingError.message);

  const wantedIds = new Set(rows.map((row) => row.component_product_id));
  const toDelete = (existing ?? [])
    .map((row) => row.component_product_id)
    .filter((id) => !wantedIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("product_components")
      .delete()
      .eq("set_product_id", productId)
      .in("component_product_id", toDelete);
    if (error) throw new Error(error.message);
  }

  const { error: upsertError } = await supabase
    .from("product_components")
    .upsert(rows, { onConflict: "set_product_id,component_product_id" });
  if (upsertError) throw new Error(upsertError.message);

  const { error: flagError } = await supabase
    .from("products")
    .update({ is_set: true })
    .eq("id", productId)
    .eq("company_id", companyId);
  if (flagError) throw new Error(flagError.message);
  await syncBundleTag(supabase, companyId, productId, true);

  for (const row of rows) {
    if (row.allocated_cost == null || !(row.quantity > 0)) continue;
    const { error } = await supabase
      .from("products")
      .update({ unit_cost_price: inheritedUnitCost(row.allocated_cost, row.quantity) })
      .eq("id", row.component_product_id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }
}
