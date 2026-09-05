"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ProductClassification } from "@/lib/labels";

export async function createProduct(formData: FormData) {
  const { supabase, companyId } = await requireUser();
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const brandName = String(formData.get("brand") ?? "").trim();
  const classification = String(formData.get("classification") ?? "") as ProductClassification | "";
  const unitCost = Number(formData.get("unit_cost_price") ?? 0);
  const rrp = formData.get("rrp") ? Number(formData.get("rrp")) : null;
  const threshold = formData.get("low_stock_threshold")
    ? Number(formData.get("low_stock_threshold"))
    : null;

  let brandId: string | null = null;
  if (brandName) {
    const { data: existing } = await supabase
      .from("brands")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", brandName)
      .maybeSingle();

    if (existing) {
      brandId = existing.id;
    } else {
      const { data: created, error: brandError } = await supabase
        .from("brands")
        .insert({ company_id: companyId, name: brandName })
        .select("id")
        .single();
      if (brandError) throw brandError;
      brandId = created.id;
    }
  }

  const { data: defaultTax } = await supabase
    .from("tax_rates")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  const { error } = await supabase.from("products").insert({
    company_id: companyId,
    sku,
    name,
    brand_id: brandId,
    unit_cost_price: unitCost,
    rrp,
    low_stock_threshold: threshold,
    default_classification: classification || null,
    tax_rate_id: defaultTax?.id ?? null,
  });

  if (error) throw error;
  revalidatePath("/products");
  revalidatePath("/");
}
