"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ORDER_FORMS_BUCKET } from "@/lib/data/order-forms";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["csv", "xlsx"];

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

/**
 * Uploads a supplier's order form for one brand (CSV or Excel .xlsx, up to
 * 10 MB), replacing the brand's current form — there's only ever one.
 */
export async function uploadSupplierOrderForm(supplierId: string, brandId: string, formData: FormData) {
  const { companyId, user } = await checkSupplierBrand(supplierId, brandId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV or Excel file.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) throw new Error("Order forms must be a .csv or .xlsx file.");
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
    },
    { onConflict: "supplier_id,brand_id" },
  );
  if (saveError) {
    await admin.storage.from(ORDER_FORMS_BUCKET).remove([path]);
    throw new Error(saveError.message || "Could not save the order form.");
  }

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
