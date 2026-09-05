import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getBranches(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getStoreLocations(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("store_locations")
    .select("id, name, branch_id, branches!inner(company_id)")
    .eq("branches.company_id", companyId)
    .order("name");

  if (error) throw error;
  return (data ?? []).map(({ branches: _branches, ...location }) => location);
}

export async function getBrands(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getTags(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getTaxRates(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("tax_rates")
    .select("id, name, rate_percentage, is_default")
    .eq("company_id", companyId)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getSuppliers(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_name, poc_name, poc_number, order_channel, gst_registered")
    .eq("company_id", companyId)
    .order("supplier_name");

  if (error) throw error;
  return data ?? [];
}

export async function getProducts(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, name, unit_cost_price, rrp, default_classification, low_stock_threshold, brand_id, brands(name)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}
