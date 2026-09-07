import type { createClient } from "@/lib/supabase/server";
import { getCurrentStock } from "@/lib/data/stock";
import { productDisplayName } from "@/lib/format";

type Client = Awaited<ReturnType<typeof createClient>>;

const RETAIL_TYPES = new Set(["retail", "retail_inhouse"]);

export async function getRecentRetailUse(supabase: Client, companyId: string, branchId?: string) {
  let query = supabase
    .from("retail_use_entries")
    .select(
      "id, quantity_used, entry_date, external_reference, notes, products(sku, name, order_name), branches(name), store_locations(name)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getRetailExportRows(supabase: Client, companyId: string, branchId?: string) {
  const [{ data: products, error: productError }, { data: poItems, error: poError }, stock] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, order_name, default_classification, brands(name)")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("purchase_order_items")
        .select("product_id, classification, purchase_orders!inner(company_id)")
        .eq("purchase_orders.company_id", companyId)
        .in("classification", ["retail", "retail_inhouse"]),
      getCurrentStock(supabase),
    ]);

  if (productError) throw productError;
  if (poError) throw poError;

  const retailIds = new Set<string>();
  for (const product of products ?? []) {
    if (product.default_classification && RETAIL_TYPES.has(product.default_classification)) {
      retailIds.add(product.id);
    }
  }
  for (const item of poItems ?? []) {
    retailIds.add(item.product_id);
  }

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const stockByProduct = new Map<string, typeof stock>();
  for (const row of stock) {
    if (!row.product_id) continue;
    const list = stockByProduct.get(row.product_id) ?? [];
    list.push(row);
    stockByProduct.set(row.product_id, list);
  }

  return [...retailIds].flatMap((productId) => {
    const product = productMap.get(productId);
    if (!product) return [];
    const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands;
    const rows = stockByProduct.get(productId) ?? [
      {
        product_id: productId,
        store_location_id: null,
        quantity_on_hand: 0,
        sku: product.sku,
        name: productDisplayName(product),
        location_name: null,
        branch_id: branchId ?? null,
        branch_name: null,
      },
    ];

    return rows
      .filter((row) => !branchId || row.branch_id === branchId)
      .map((row) => ({
        sku: product.sku,
        name: productDisplayName(product),
        brand: brand?.name ?? "",
        classification: product.default_classification ?? "",
        branch: row.branch_name ?? "",
        location: row.location_name ?? "",
        quantity_on_hand: Number(row.quantity_on_hand ?? 0),
      }));
  });
}
