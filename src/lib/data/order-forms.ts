import { readOrderForm, type OrderFormLine } from "@/lib/order-form-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const ORDER_FORMS_BUCKET = "supplier-order-forms";
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
/** How long a download link stays valid. */
const LINK_SECONDS = 60 * 60;

/** A match set by hand: order form line (by its key) to a product, or to nothing. */
export type OrderFormMatch = { lineKey: string; productId: string | null };

export type BrandOrderForm = {
  brandId: string;
  brandName: string;
  /** Matches set by hand on the comparison; they override the automatic matching. */
  matches: OrderFormMatch[];
  /** The current uploaded form, or null if none yet. */
  form: {
    fileName: string;
    sizeBytes: number | null;
    uploadedAt: string;
    uploadedBy: string | null;
    downloadUrl: string | null;
    /** The product lines read from the file, or null if it couldn't be read. */
    lines: OrderFormLine[] | null;
    readError: string | null;
  } | null;
};

/**
 * Every brand a supplier carries (from its price list's products), each with
 * its current uploaded order form if there is one.
 */
export async function getSupplierBrandOrderForms(
  supabase: Client,
  companyId: string,
  supplierId: string,
): Promise<BrandOrderForm[]> {
  const productIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("supplier_products")
      .select("product_id")
      .eq("supplier_id", supplierId)
      .order("product_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    productIds.push(...(data ?? []).map((row) => row.product_id));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const brands = new Map<string, string>();
  for (let index = 0; index < productIds.length; index += IN_CHUNK) {
    const { data, error } = await supabase
      .from("products")
      .select("brand_id, brands(id, name)")
      .eq("company_id", companyId)
      .in("id", productIds.slice(index, index + IN_CHUNK))
      .not("brand_id", "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
      if (brand?.id && brand.name?.trim()) brands.set(brand.id, brand.name.trim());
    }
  }

  const { data: forms, error: formsError } = await supabase
    .from("supplier_order_forms")
    .select("brand_id, file_path, file_name, size_bytes, uploaded_at, uploaded_by")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  if (formsError) throw formsError;

  const { data: matchRows, error: matchesError } = await supabase
    .from("supplier_order_form_matches")
    .select("brand_id, line_key, product_id")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  if (matchesError) throw matchesError;
  const matchesByBrand = new Map<string, OrderFormMatch[]>();
  for (const row of matchRows ?? []) {
    const list = matchesByBrand.get(row.brand_id) ?? [];
    list.push({ lineKey: row.line_key, productId: row.product_id });
    matchesByBrand.set(row.brand_id, list);
  }

  const admin = createAdminClient();
  const formByBrand = new Map<string, BrandOrderForm["form"]>();
  for (const form of forms ?? []) {
    const { data: signed } = await admin.storage
      .from(ORDER_FORMS_BUCKET)
      .createSignedUrl(form.file_path, LINK_SECONDS, { download: form.file_name });
    let lines: OrderFormLine[] | null = null;
    let readError: string | null = null;
    try {
      const { data: file, error } = await admin.storage.from(ORDER_FORMS_BUCKET).download(form.file_path);
      if (error || !file) throw new Error(error?.message || "The file couldn't be downloaded.");
      lines = await readOrderForm(await file.arrayBuffer(), form.file_name);
    } catch (err) {
      readError = err instanceof Error ? err.message : "The file couldn't be read.";
    }
    formByBrand.set(form.brand_id, {
      lines,
      readError,
      fileName: form.file_name,
      sizeBytes: form.size_bytes,
      uploadedAt: form.uploaded_at,
      uploadedBy: form.uploaded_by,
      downloadUrl: signed?.signedUrl ?? null,
    });
  }

  return [...brands]
    .map(([brandId, brandName]) => ({
      brandId,
      brandName,
      matches: matchesByBrand.get(brandId) ?? [],
      form: formByBrand.get(brandId) ?? null,
    }))
    .sort((left, right) => left.brandName.localeCompare(right.brandName));
}
