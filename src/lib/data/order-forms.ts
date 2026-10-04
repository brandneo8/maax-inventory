import { lineUp, type ComparisonProduct } from "@/lib/order-form-match";
import { readOrderForm, type OrderFormLine } from "@/lib/order-form-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export const ORDER_FORMS_BUCKET = "supplier-order-forms";
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
/** How long a download link stays valid. */
const LINK_SECONDS = 60 * 60;

/** Order forms sent as a photo: their lines are typed in by hand. */
export const IMAGE_FORM_EXTENSIONS = ["jpg", "jpeg", "png"];

export function isImageFormName(fileName: string) {
  return IMAGE_FORM_EXTENSIONS.includes(fileName.split(".").pop()?.toLowerCase() ?? "");
}

/**
 * Lines read from uploaded spreadsheets, by storage path. Each upload gets
 * a new path, so a cached file never changes underneath its entry.
 */
const sheetCache = new Map<string, OrderFormLine[]>();
const SHEET_CACHE_LIMIT = 50;

/** Reads a stored spreadsheet form (cached by its path). */
async function readStoredSheet(filePath: string, fileName: string) {
  const cached = sheetCache.get(filePath);
  if (cached) return cached;
  const { data: file, error } = await createAdminClient().storage.from(ORDER_FORMS_BUCKET).download(filePath);
  if (error || !file) throw new Error(error?.message || "The file couldn't be downloaded.");
  const lines = await readOrderForm(await file.arrayBuffer(), fileName);
  if (sheetCache.size >= SHEET_CACHE_LIMIT) sheetCache.delete(sheetCache.keys().next().value!);
  sheetCache.set(filePath, lines);
  return lines;
}

/** A match set by hand: order form line (by its key) to a product, or to nothing. */
export type OrderFormMatch = {
  lineKey: string;
  productId: string | null;
  /** When it was set; the rows of one swap share it, so they're undone together. */
  matchedAt: string;
};

export type BrandOrderForm = {
  brandId: string;
  brandName: string;
  /** Matches set by hand on the comparison; they override the automatic matching. */
  matches: OrderFormMatch[];
  /** The current uploaded form, or null if none yet. */
  form: {
    fileName: string;
    /** A spreadsheet (lines read from the file) or a photo (lines typed in by hand). */
    kind: "sheet" | "image";
    /** For a photo: a link to show it on the page. */
    imageUrl: string | null;
    sizeBytes: number | null;
    uploadedAt: string;
    uploadedBy: string | null;
    downloadUrl: string | null;
    /** The product lines read from the file, or null if it couldn't be read. */
    lines: OrderFormLine[] | null;
    readError: string | null;
  } | null;
};

const formKey = (supplierId: string, brandId: string) => `${supplierId}:${brandId}`;

/** Lines typed in from photo order forms, by supplier + brand (formKey), in order. */
async function getTypedOrderFormLines(supabase: Client, companyId: string, supplierId: string | null = null) {
  const byBrand = new Map<string, OrderFormLine[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("supplier_order_form_lines")
      .select("supplier_id, brand_id, position, sku, description, size, cost, rrp")
      .eq("company_id", companyId);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query
      .order("supplier_id")
      .order("brand_id")
      .order("position")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = formKey(row.supplier_id, row.brand_id);
      const list = byBrand.get(key) ?? [];
      list.push({
        source: `Line ${list.length + 1}`,
        sku: row.sku,
        description: row.description,
        size: row.size,
        cost: row.cost == null ? null : Number(row.cost),
        rrp: row.rrp == null ? null : Number(row.rrp),
      });
      byBrand.set(key, list);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return byBrand;
}

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
    .select("brand_id, line_key, product_id, matched_at")
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId);
  if (matchesError) throw matchesError;
  const matchesByBrand = new Map<string, OrderFormMatch[]>();
  for (const row of matchRows ?? []) {
    const list = matchesByBrand.get(row.brand_id) ?? [];
    list.push({ lineKey: row.line_key, productId: row.product_id, matchedAt: row.matched_at });
    matchesByBrand.set(row.brand_id, list);
  }

  const typedLines = await getTypedOrderFormLines(supabase, companyId, supplierId);

  const admin = createAdminClient();
  const formByBrand = new Map<string, BrandOrderForm["form"]>();
  for (const form of forms ?? []) {
    const kind = isImageFormName(form.file_name) ? "image" : "sheet";
    const { data: signed } = await admin.storage
      .from(ORDER_FORMS_BUCKET)
      .createSignedUrl(form.file_path, LINK_SECONDS, { download: form.file_name });
    let imageUrl: string | null = null;
    let lines: OrderFormLine[] | null = null;
    let readError: string | null = null;
    if (kind === "image") {
      const { data: view } = await admin.storage.from(ORDER_FORMS_BUCKET).createSignedUrl(form.file_path, LINK_SECONDS);
      imageUrl = view?.signedUrl ?? null;
      lines = typedLines.get(formKey(supplierId, form.brand_id)) ?? [];
    } else {
      try {
        lines = await readStoredSheet(form.file_path, form.file_name);
      } catch (err) {
        readError = err instanceof Error ? err.message : "The file couldn't be read.";
      }
    }
    formByBrand.set(form.brand_id, {
      lines,
      readError,
      kind,
      imageUrl,
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

/**
 * For each supplier with order forms: how many of its products are paired
 * with an order form line, using the same matching as the price list
 * comparison (hand-set swaps first, then SKU, then name). Forms that can't be
 * read count as no matches.
 */
export async function getOrderFormMatchCounts(supabase: Client, companyId: string): Promise<Record<string, number>> {
  const { data: forms, error: formsError } = await supabase
    .from("supplier_order_forms")
    .select("supplier_id, brand_id, file_path, file_name")
    .eq("company_id", companyId);
  if (formsError) throw formsError;
  if (!forms || forms.length === 0) return {};

  const supplierIds = [...new Set(forms.map((form) => form.supplier_id))];
  const productSuppliers = new Map<string, string[]>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("supplier_products")
      .select("supplier_id, product_id")
      .in("supplier_id", supplierIds)
      .order("product_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      productSuppliers.set(row.product_id, [...(productSuppliers.get(row.product_id) ?? []), row.supplier_id]);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  // This supplier's products of this brand, as the comparison sees them.
  const productsByForm = new Map<string, ComparisonProduct[]>();
  const productIds = [...productSuppliers.keys()];
  for (let index = 0; index < productIds.length; index += IN_CHUNK) {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, order_name, name, size_label, brand_id")
      .eq("company_id", companyId)
      .in("id", productIds.slice(index, index + IN_CHUNK));
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.brand_id) continue;
      const product: ComparisonProduct = {
        id: row.id,
        sku: row.sku ?? "",
        orderName: row.order_name ?? "",
        name: row.name ?? "",
        size: row.size_label ?? "",
        unitCost: 0,
        rrp: null,
      };
      for (const supplierId of productSuppliers.get(row.id) ?? []) {
        const key = formKey(supplierId, row.brand_id);
        productsByForm.set(key, [...(productsByForm.get(key) ?? []), product]);
      }
    }
  }

  const { data: matchRows, error: matchesError } = await supabase
    .from("supplier_order_form_matches")
    .select("supplier_id, brand_id, line_key, product_id")
    .eq("company_id", companyId);
  if (matchesError) throw matchesError;
  const manualByForm = new Map<string, Map<string, string | null>>();
  for (const row of matchRows ?? []) {
    const key = formKey(row.supplier_id, row.brand_id);
    const manual = manualByForm.get(key) ?? new Map<string, string | null>();
    manual.set(row.line_key, row.product_id);
    manualByForm.set(key, manual);
  }

  const typedLines = await getTypedOrderFormLines(supabase, companyId);
  const counts: Record<string, number> = {};
  await Promise.all(
    forms.map(async (form) => {
      const key = formKey(form.supplier_id, form.brand_id);
      let lines: OrderFormLine[] = [];
      if (isImageFormName(form.file_name)) lines = typedLines.get(key) ?? [];
      else {
        try {
          lines = await readStoredSheet(form.file_path, form.file_name);
        } catch {
          lines = [];
        }
      }
      const rows = lineUp(productsByForm.get(key) ?? [], lines, manualByForm.get(key) ?? new Map());
      const matched = rows.filter((row) => row.pulse && row.form).length;
      counts[form.supplier_id] = (counts[form.supplier_id] ?? 0) + matched;
    }),
  );
  return counts;
}
