import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

function throwQuery(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) throw new Error(message);
  }
  throw new Error(fallback);
}

export async function getBranches(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throwQuery(error, "Could not load salons.");
  return data ?? [];
}

export async function getStoreLocations(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("store_locations")
    .select("id, name, branch_id, sort_order, branches!inner(company_id)")
    .eq("branches.company_id", companyId)
    .order("sort_order")
    .order("name");

  if (error) throwQuery(error, "Could not load data.");
  return (data ?? []).map(({ branches: _branches, ...location }) => location);
}

export async function getBrands(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throwQuery(error, "Could not load data.");
  return data ?? [];
}

export async function getTags(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throwQuery(error, "Could not load data.");
  return data ?? [];
}

export async function getTaxRates(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("tax_rates")
    .select("id, name, rate_percentage, is_default")
    .eq("company_id", companyId)
    .order("name");

  if (error) throwQuery(error, "Could not load data.");
  return data ?? [];
}

export async function getSuppliers(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_name, poc_name, poc_number, order_channel, gst_registered")
    .eq("company_id", companyId)
    .order("supplier_name");

  if (error) throwQuery(error, "Could not load data.");
  return data ?? [];
}

export async function getProducts(supabase: Client, companyId: string) {
  const pageSize = 1000;
  const products = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sku, barcode, name, order_name, unit_cost_price, rrp, default_classification, low_stock_threshold, brand_id, size_label, size_ml, is_set, brand_sub, brands(name), product_tags(tag_id, tags(name)), product_branches(branch_id), product_components!product_components_set_product_id_fkey(component_product_id, quantity, allocated_cost)",
      )
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("order_name")
      .range(from, from + pageSize - 1);

    if (error) throwQuery(error, "Could not load data.");
    products.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return products;
}
