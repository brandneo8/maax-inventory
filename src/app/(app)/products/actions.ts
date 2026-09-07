"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { catalogSize, normalizeOptionalText, parseMoney } from "@/lib/catalog-import";
import { persistProductComponents, syncBundleTag } from "@/lib/data/product-components";
import type { ProductClassification } from "@/lib/labels";
import { parseSize } from "@/lib/product-size";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

function revalidateCatalog() {
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/home");
  revalidatePath("/orders");
  revalidatePath("/reports");
  revalidatePath("/counts");
  revalidatePath("/");
}

export async function createProduct(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  const sku = normalizeOptionalText(String(formData.get("sku") ?? ""));
  const barcode = normalizeOptionalText(String(formData.get("barcode") ?? ""));
  const name = String(formData.get("order_name") ?? formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Order name is required.");
  }
  const brandName = String(formData.get("brand") ?? "").trim();
  const brandSub = normalizeOptionalText(String(formData.get("brand_sub") ?? ""));
  const classification = String(formData.get("classification") ?? "") as ProductClassification | "";
  const unitCost = Number(formData.get("unit_cost_price") ?? 0);
  const rrp = formData.get("rrp") ? Number(formData.get("rrp")) : null;
  const threshold = formData.get("low_stock_threshold")
    ? Number(formData.get("low_stock_threshold"))
    : null;
  const sizeRaw = String(formData.get("size") ?? "").trim();
  const parsedSize = parseSize(sizeRaw);
  if (sizeRaw && !parsedSize) {
    throw new Error("Size must look like 175ml, 175 ml, 1L, or 175g.");
  }
  const isSet = formData.get("is_set") === "on";
  const brandId = await resolveBrandId(supabase, companyId, brandName);

  const { data: defaultTax } = await supabase
    .from("tax_rates")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      company_id: companyId,
      sku,
      barcode,
      order_name: name,
      name: normalizeOptionalText(String(formData.get("display_name") ?? "")),
      brand_id: brandId,
      brand_sub: brandSub,
      unit_cost_price: unitCost,
      rrp,
      low_stock_threshold: threshold,
      default_classification: classification || null,
      tax_rate_id: defaultTax?.id ?? null,
      size_label: parsedSize?.label ?? null,
      size_ml: parsedSize?.ml ?? null,
      is_set: isSet,
    })
    .select("id")
    .single();

  if (error) throw error;

  const validBranchIds = await companyBranchIds(supabase, companyId);
  const assigned = validBranchIds.filter((id) => formData.get(`branch:${id}`) === "on");
  await syncProductBranches(supabase, created.id, assigned, validBranchIds);
  revalidateCatalog();
}

const CLASSIFICATION_VALUES = new Set<ProductClassification>([
  "retail",
  "inhouse",
  "gwp",
  "retail_inhouse",
]);

function parseProductIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function chunkIds(ids: string[], size = 200) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

async function resolveBrandId(
  supabase: Client,
  companyId: string,
  brandName: string,
) {
  const name = brandName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from("brands")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("brands")
    .insert({ company_id: companyId, name })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export type ProductDraft = {
  id?: string;
  clientKey?: string;
  sku: string;
  barcode: string;
  name: string;
  orderName: string;
  brand: string;
  brandSub: string;
  size: string;
  classification: ProductClassification | "";
  unitCost: string;
  rrp: string;
  threshold: string;
  isSet: boolean;
  branchIds: string[];
  tagIds: string[];
  supplierIds: string[];
  components: { productId: string; quantity: number; allocatedCost?: number | null }[];
};

async function companyBranchIds(supabase: Client, companyId: string) {
  const { data, error } = await supabase.from("branches").select("id").eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []).map((branch) => branch.id);
}

async function syncProductBranches(
  supabase: Client,
  productId: string,
  requestedIds: string[],
  validBranchIds: string[],
) {
  const wanted = [...new Set(requestedIds.filter((id) => validBranchIds.includes(id)))];
  const { error: deleteError } = await supabase.from("product_branches").delete().eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (wanted.length === 0) return;
  const { error: insertError } = await supabase
    .from("product_branches")
    .insert(wanted.map((branchId) => ({ product_id: productId, branch_id: branchId })));
  if (insertError) throw insertError;
}

async function companySupplierIds(supabase: Client, companyId: string) {
  const { data, error } = await supabase.from("suppliers").select("id").eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []).map((supplier) => supplier.id);
}

async function syncProductSuppliers(
  supabase: Client,
  productId: string,
  requestedIds: string[],
  validSupplierIds: string[],
) {
  const wanted = [...new Set(requestedIds.filter((id) => validSupplierIds.includes(id)))];
  const { error: deleteError } = await supabase.from("supplier_products").delete().eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (wanted.length === 0) return;
  const { error: insertError } = await supabase.from("supplier_products").insert(
    wanted.map((supplierId, index) => ({
      product_id: productId,
      supplier_id: supplierId,
      is_preferred: index === 0,
    })),
  );
  if (insertError) throw insertError;
}

async function syncProductTags(supabase: Client, companyId: string, productId: string, requestedIds: string[]) {
  const wanted = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))];
  let tagIds: string[] = [];
  if (wanted.length > 0) {
    const { data: ownedTags, error: tagError } = await supabase
      .from("tags")
      .select("id")
      .eq("company_id", companyId)
      .in("id", wanted);
    if (tagError) throw tagError;
    tagIds = (ownedTags ?? []).map((tag) => tag.id);
  }

  const { error: deleteError } = await supabase.from("product_tags").delete().eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (tagIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("product_tags")
    .insert(tagIds.map((tagId) => ({ product_id: productId, tag_id: tagId })));
  if (insertError) throw insertError;
}

export async function saveProducts(drafts: ProductDraft[]) {
  const { supabase, companyId } = await requireAdmin();
  const rows = drafts.filter((draft) => draft.orderName.trim());
  if (rows.length === 0) {
    throw new Error("Add at least one product order name before saving.");
  }

  const { data: defaultTax } = await supabase
    .from("tax_rates")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  const validBranchIds = await companyBranchIds(supabase, companyId);
  const validSupplierIds = await companySupplierIds(supabase, companyId);
  const saved: { clientKey: string | null; id: string }[] = [];

  for (const draft of rows) {
    const size = catalogSize(draft.size);
    const payload = {
      sku: normalizeOptionalText(draft.sku),
      barcode: normalizeOptionalText(draft.barcode),
      order_name: draft.orderName.trim(),
      name: normalizeOptionalText(draft.name),
      brand_id: await resolveBrandId(supabase, companyId, draft.brand),
      brand_sub: normalizeOptionalText(draft.brandSub),
      unit_cost_price: parseMoney(draft.unitCost) ?? 0,
      rrp: parseMoney(draft.rrp),
      low_stock_threshold: parseMoney(draft.threshold),
      default_classification:
        draft.classification && CLASSIFICATION_VALUES.has(draft.classification)
          ? draft.classification
          : null,
      size_label: size.sizeLabel,
      size_ml: size.sizeMl,
      is_set: draft.isSet,
    };

    let productId = draft.id;
    if (productId) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", productId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("products")
        .insert({
          ...payload,
          company_id: companyId,
          tax_rate_id: defaultTax?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      productId = created.id;
    }

    await syncProductBranches(supabase, productId, draft.branchIds ?? [], validBranchIds);
    await syncProductSuppliers(supabase, productId, draft.supplierIds ?? [], validSupplierIds);
    await persistProductComponents(supabase, companyId, {
      productId,
      isSet: draft.isSet,
      parentUnitCost: parseMoney(draft.unitCost) ?? 0,
      components: draft.components ?? [],
      replaceEmpty: false,
    });
    await syncProductTags(supabase, companyId, productId, draft.tagIds ?? []);
    await syncBundleTag(supabase, companyId, productId, draft.isSet);
    saved.push({ clientKey: draft.clientKey ?? null, id: productId });
  }

  revalidateCatalog();
  return { saved };
}

export async function deleteProduct(id: string) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase.from("products").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  revalidateCatalog();
}

export async function bulkUpdateProductClassification(input: {
  productIds: string[];
  classification: ProductClassification | "";
}) {
  const { supabase, companyId } = await requireAdmin();
  const productIds = parseProductIds(input.productIds);
  if (productIds.length === 0) {
    throw new Error("Select at least one product.");
  }

  const classification =
    input.classification && CLASSIFICATION_VALUES.has(input.classification)
      ? input.classification
      : null;

  for (const ids of chunkIds(productIds)) {
    const { error } = await supabase
      .from("products")
      .update({ default_classification: classification })
      .eq("company_id", companyId)
      .in("id", ids);
    if (error) throw error;
  }

  revalidateCatalog();
}

export async function bulkReplaceProductTags(input: { productIds: string[]; tagIds: string[] }) {
  const { supabase, companyId } = await requireAdmin();
  const productIds = parseProductIds(input.productIds);
  if (productIds.length === 0) {
    throw new Error("Select at least one product.");
  }

  const ownedIds: string[] = [];
  for (const ids of chunkIds(productIds)) {
    const { data: ownedProducts, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .in("id", ids);
    if (productError) throw productError;
    ownedIds.push(...(ownedProducts ?? []).map((product) => product.id));
  }
  if (ownedIds.length === 0) {
    throw new Error("No matching products to update.");
  }

  const requestedTagIds = [...new Set(input.tagIds.map((id) => id.trim()).filter(Boolean))];
  let tagIds: string[] = [];
  if (requestedTagIds.length > 0) {
    const { data: ownedTags, error: tagError } = await supabase
      .from("tags")
      .select("id")
      .eq("company_id", companyId)
      .in("id", requestedTagIds);
    if (tagError) throw tagError;
    tagIds = (ownedTags ?? []).map((tag) => tag.id);
  }

  for (const ids of chunkIds(ownedIds)) {
    const { error: deleteError } = await supabase.from("product_tags").delete().in("product_id", ids);
    if (deleteError) throw deleteError;
  }

  if (tagIds.length > 0) {
    for (const ids of chunkIds(ownedIds)) {
      const { error: insertError } = await supabase.from("product_tags").insert(
        ids.flatMap((productId) => tagIds.map((tagId) => ({ product_id: productId, tag_id: tagId }))),
      );
      if (insertError) throw insertError;
    }
  }

  revalidateCatalog();
}

export async function bulkUpdateProductBranches(input: { productIds: string[]; branchIds: string[] }) {
  const { supabase, companyId } = await requireAdmin();
  const productIds = parseProductIds(input.productIds);
  if (productIds.length === 0) {
    throw new Error("Select at least one product.");
  }

  const validBranchIds = await companyBranchIds(supabase, companyId);
  const ownedIds: string[] = [];
  for (const ids of chunkIds(productIds)) {
    const { data: ownedProducts, error } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .in("id", ids);
    if (error) throw error;
    ownedIds.push(...(ownedProducts ?? []).map((product) => product.id));
  }
  if (ownedIds.length === 0) {
    throw new Error("No matching products to update.");
  }

  for (const ids of chunkIds(ownedIds)) {
    const { error: deleteError } = await supabase.from("product_branches").delete().in("product_id", ids);
    if (deleteError) throw deleteError;
  }

  const branchIds = [...new Set(input.branchIds.filter((id) => validBranchIds.includes(id)))];
  if (branchIds.length > 0) {
    for (const ids of chunkIds(ownedIds)) {
      const { error: insertError } = await supabase.from("product_branches").insert(
        ids.flatMap((productId) => branchIds.map((branchId) => ({ product_id: productId, branch_id: branchId }))),
      );
      if (insertError) throw insertError;
    }
  }

  revalidateCatalog();
}
