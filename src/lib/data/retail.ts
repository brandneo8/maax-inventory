import type { createClient } from "@/lib/supabase/server";
import { getCurrentStock } from "@/lib/data/stock";
import { productDisplayName } from "@/lib/format";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getRecentRetailUse(supabase: Client, companyId: string, branchId?: string) {
  let query = supabase
    .from("retail_use_entries")
    .select(
      "id, quantity_used, entry_date, external_reference, notes, products(sku, name, order_name), branches(name)",
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
  const [{ data: products, error: productError }, { data: poItems, error: poError }, stock, branchTags] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, order_name, brands(name)")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("purchase_order_items")
        .select("product_id, classification, purchase_orders!inner(company_id)")
        .eq("purchase_orders.company_id", companyId)
        .in("classification", ["retail", "retail_inhouse"]),
      getCurrentStock(supabase),
      branchId
        ? supabase.from("product_branch_classifications").select("product_id, classification").eq("branch_id", branchId)
        : Promise.resolve({ data: [] as { product_id: string; classification: string }[], error: null }),
    ]);

  if (productError) throw productError;
  if (poError) throw poError;
  if (branchTags.error) throw branchTags.error;

  const classificationsByProduct = new Map<string, string[]>();
  for (const row of branchTags.data ?? []) {
    const list = classificationsByProduct.get(row.product_id) ?? [];
    list.push(row.classification);
    classificationsByProduct.set(row.product_id, list);
  }

  const retailIds = new Set<string>();
  for (const product of products ?? []) {
    if ((classificationsByProduct.get(product.id) ?? []).includes("retail")) {
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
    const rows = (stockByProduct.get(productId) ?? []).filter(
      (row) => !branchId || row.branch_id === branchId,
    );
    const quantity = rows.reduce((sum, row) => sum + Number(row.quantity_on_hand ?? 0), 0);
    const branchName = rows.find((row) => row.branch_name)?.branch_name ?? "";
    return [
      {
        sku: product.sku,
        name: productDisplayName(product),
        brand: brand?.name ?? "",
        classification: (classificationsByProduct.get(product.id) ?? []).join(","),
        branch: branchName,
        quantity_on_hand: quantity,
      },
    ];
  });
}
