"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { IMAGE_FORM_EXTENSIONS, ORDER_FORMS_BUCKET, isImageFormName } from "@/lib/data/order-forms";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["csv", "xlsx", ...IMAGE_FORM_EXTENSIONS];
const MAX_TYPED_LINES = 500;

/** The supplier and brand, checked to belong to this company. */
async function checkSupplierBrand(supplierId: string, brandId: string) {
  const ctx = await requireAdmin();
  const [{ data: supplier }, { data: brand }] = await Promise.all([
    ctx.supabase.from("suppliers").select("id").eq("company_id", ctx.companyId).eq("id", supplierId).maybeSingle(),
    ctx.supabase.from("brands").select("id").eq("company_id", ctx.companyId).eq("id", brandId).maybeSingle(),
  ]);
  if (!supplier || !brand) throw new Error("That supplier or brand wasn't found.");
  return ctx;
}

function revalidatePriceList(supplierId: string) {
  revalidatePath(`/admin/suppliers/${supplierId}/products`);
}

/** Drops the lines typed in from a photo / PDF form (when it's replaced by a spreadsheet, or removed). */
async function clearTypedLines(supplierId: string, brandId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("supplier_order_form_lines")
    .delete()
    .eq("supplier_id", supplierId)
    .eq("brand_id", brandId);
  if (error) throw new Error(error.message || "Could not clear the typed-in lines.");
}

/**
 * Uploads a supplier's order form for one brand (CSV or Excel .xlsx, or a
 * JPG / PNG photo or PDF whose lines are typed in by hand; up to 10 MB), replacing
 * the brand's current form — there's only ever one. Lines typed in from a
 * photo or PDF are kept when it's replaced by another photo or PDF.
 */
export async function uploadSupplierOrderForm(supplierId: string, brandId: string, formData: FormData) {
  const { companyId, user } = await checkSupplierBrand(supplierId, brandId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV or Excel file.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error("Order forms must be a .csv or .xlsx file, a .jpg or .png photo, or a .pdf.");
  }
  if (file.size > MAX_BYTES) throw new Error("Order forms must be smaller than 10 MB.");

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("supplier_order_forms")
    .select("file_path")
    .eq("supplier_id", supplierId)
    .eq("brand_id", brandId)
    .maybeSingle();

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const path = `${companyId}/${supplierId}/${brandId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from(ORDER_FORMS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) throw new Error(uploadError.message || "Could not upload the order form.");

  const { error: saveError } = await admin.from("supplier_order_forms").upsert(
    {
      company_id: companyId,
      supplier_id: supplierId,
      brand_id: brandId,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_at: new Date().toISOString(),
      uploaded_by: user.email ?? null,
      // A new spreadsheet is asked for its exchange rate again; a photo / PDF keeps it with its typed lines.
      ...(isImageFormName(file.name) ? {} : { currency: null, fx_rate: null }),
    },
    { onConflict: "supplier_id,brand_id" },
  );
  if (saveError) {
    await admin.storage.from(ORDER_FORMS_BUCKET).remove([path]);
    throw new Error(saveError.message || "Could not save the order form.");
  }

  if (!isImageFormName(file.name)) await clearTypedLines(supplierId, brandId);

  // The replaced file is no longer referenced.
  if (existing?.file_path && existing.file_path !== path) {
    await admin.storage.from(ORDER_FORMS_BUCKET).remove([existing.file_path]);
  }
  revalidatePriceList(supplierId);
}

/** Removes a brand's order form (and its file). */
export async function removeSupplierOrderForm(supplierId: string, brandId: string) {
  await checkSupplierBrand(supplierId, brandId);
  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("supplier_order_forms")
    .delete()
    .eq("supplier_id", supplierId)
    .eq("brand_id", brandId)
    .select("file_path")
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not remove the order form.");
  if (existing?.file_path) await admin.storage.from(ORDER_FORMS_BUCKET).remove([existing.file_path]);
  await clearTypedLines(supplierId, brandId);
  revalidatePriceList(supplierId);
}

/**
 * One hand-set match: an order form line (by its key) to a product, or to
 * nothing ("not on Pulse"). The key `!<productId>` keeps that product off the
 * form instead (so automatic matching leaves it alone).
 */
export type OrderFormMatchChange = { lineKey: string; productId: string | null };

/**
 * Saves hand-set matches from moving a Pulse product to another row,
 * overriding the automatic matching. A product sits on one row at a time, so
 * its other hand-set matches are removed.
 */
export async function saveOrderFormMatches(supplierId: string, brandId: string, changes: OrderFormMatchChange[]) {
  const { supabase, companyId, user } = await checkSupplierBrand(supplierId, brandId);
  if (changes.length === 0) return;
  if (changes.some((change) => !change.lineKey.trim())) throw new Error("That order form line wasn't found.");
  const productIds = [...new Set(changes.flatMap((change) => (change.productId ? [change.productId] : [])))];
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .eq("brand_id", brandId)
      .in("id", productIds);
    if (productsError) throw new Error(productsError.message || "Could not save the match.");
    if ((products ?? []).length !== productIds.length) throw new Error("That product isn't one of this brand's products.");
    const { error: clearError } = await supabase
      .from("supplier_order_form_matches")
      .delete()
      .eq("supplier_id", supplierId)
      .eq("brand_id", brandId)
      .in("product_id", productIds)
      .not("line_key", "in", `(${changes.map((change) => `"${change.lineKey.replace(/"/g, '\\"')}"`).join(",")})`);
    if (clearError) throw new Error(clearError.message || "Could not save the match.");
  }
  const matchedAt = new Date().toISOString();
  const { error } = await supabase.from("supplier_order_form_matches").upsert(
    changes.map((change) => ({
      company_id: companyId,
      supplier_id: supplierId,
      brand_id: brandId,
      line_key: change.lineKey,
      product_id: change.productId,
      matched_at: matchedAt,
      matched_by: user.email ?? null,
    })),
    { onConflict: "supplier_id,brand_id,line_key" },
  );
  if (error) throw new Error(error.message || "Could not save the match.");
  revalidatePriceList(supplierId);
}

/** Puts rows back on automatic (SKU, then name) matching — the given keys, or every row of the brand. */
export async function clearOrderFormMatches(supplierId: string, brandId: string, lineKeys?: string[]) {
  const { supabase } = await checkSupplierBrand(supplierId, brandId);
  let query = supabase.from("supplier_order_form_matches").delete().eq("supplier_id", supplierId).eq("brand_id", brandId);
  if (lineKeys) query = query.in("line_key", lineKeys);
  const { error } = await query;
  if (error) throw new Error(error.message || "Could not reset the match.");
  revalidatePriceList(supplierId);
}

/** A line typed in from a photo / PDF order form. Prices are text as typed ("" = none). */
export type TypedOrderFormLine = { sku: string; description: string; size: string; cost: string; rrp: string };

function typedMoney(value: string, label: string, row: number) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Line ${row}: ${label} "${value}" isn't a price.`);
  return Math.round(amount * 100) / 100;
}

/**
 * Saves the lines typed in from a brand's photo / PDF order form, replacing the
 * ones saved before (in the order given). Blank lines are skipped.
 */
export async function saveTypedOrderFormLines(supplierId: string, brandId: string, lines: TypedOrderFormLine[]) {
  const { supabase, companyId, user } = await checkSupplierBrand(supplierId, brandId);
  const { data: form } = await supabase
    .from("supplier_order_forms")
    .select("file_name")
    .eq("supplier_id", supplierId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!form || !isImageFormName(form.file_name)) throw new Error("Upload a photo or PDF of the order form first.");

  const filled = lines.filter((line) => [line.sku, line.description, line.size, line.cost, line.rrp].some((value) => value.trim()));
  if (filled.length > MAX_TYPED_LINES) throw new Error(`An order form can have up to ${MAX_TYPED_LINES} lines.`);
  const updatedAt = new Date().toISOString();
  const rows = filled.map((line, index) => {
    const description = line.description.trim();
    if (!description) throw new Error(`Line ${index + 1} needs a description.`);
    return {
      company_id: companyId,
      supplier_id: supplierId,
      brand_id: brandId,
      position: index + 1,
      sku: line.sku.trim(),
      description,
      size: line.size.trim(),
      cost: typedMoney(line.cost, "price", index + 1),
      rrp: typedMoney(line.rrp, "RRP", index + 1),
      updated_at: updatedAt,
      updated_by: user.email ?? null,
    };
  });

  await clearTypedLines(supplierId, brandId);
  if (rows.length > 0) {
    const { error } = await supabase.from("supplier_order_form_lines").insert(rows);
    if (error) throw new Error(error.message || "Could not save the lines.");
  }
  revalidatePriceList(supplierId);
}

/**
 * Sets the currency a brand's order form is priced in, and the rate that
 * converts it to SGD (SGD per 1 unit). SGD clears the rate.
 */
export async function setOrderFormCurrency(supplierId: string, brandId: string, currency: string, fxRate: number | null) {
  const { supabase, companyId } = await checkSupplierBrand(supplierId, brandId);
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Enter a 3-letter currency code, e.g. MYR or USD.");
  if (code !== "SGD" && (fxRate == null || !Number.isFinite(fxRate) || fxRate <= 0 || fxRate > 10000)) {
    throw new Error(`Enter how many SGD 1 ${code} is worth, e.g. 0.29.`);
  }
  const { error } = await supabase
    .from("supplier_order_forms")
    .update({ currency: code, fx_rate: code === "SGD" ? null : fxRate })
    .eq("company_id", companyId)
    .eq("supplier_id", supplierId)
    .eq("brand_id", brandId);
  if (error) throw new Error(error.message || "Could not save the exchange rate.");
  revalidatePriceList(supplierId);
}
