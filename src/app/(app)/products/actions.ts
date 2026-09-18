"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireBranch } from "@/lib/auth";
import { catalogSize, normalizeOptionalText, parseMoney } from "@/lib/catalog-import";
import { createBrandResolver, resolveBrandId } from "@/lib/data/brands";
import { persistProductComponents, syncBundleTag } from "@/lib/data/product-components";
import { formatDate, productLabel } from "@/lib/format";
import { countStatusLabel, defaultPosAllowed, salonName, type ProductClassification } from "@/lib/labels";
import { parseSize } from "@/lib/product-size";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

function revalidateCatalog() {
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/home");
  revalidatePath("/orders");
  revalidatePath("/stock-in");
  revalidatePath("/stock-in/new");
  revalidatePath("/stock-in/[id]", "page");
  revalidatePath("/stock-out/new");
  revalidatePath("/stock-out/[id]", "page");
  revalidatePath("/reports");
  revalidatePath("/admin/pos");
}

function catalogWriteError(error: { code?: string; message?: string; details?: string }) {
  if (error.code === "23505") {
    const detail = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (detail.includes("barcode")) {
      return "A product with that barcode already exists.";
    }
    if (detail.includes("sku")) {
      return "A product with that SKU already exists.";
    }
    return "A product with that SKU or barcode already exists.";
  }
  return error.message || "Could not save products.";
}

function draftText(value: unknown) {
  if (value == null) return null;
  return normalizeOptionalText(String(value));
}

function catalogConflictLabel(row: { order_name: string; sku: string | null }) {
  const sku = row.sku?.trim();
  return sku ? `${row.order_name} (SKU ${sku})` : row.order_name;
}

type CatalogIdentity = {
  id: string;
  order_name: string;
  sku: string | null;
  barcode: string | null;
};

async function findByBarcode(supabase: Client, companyId: string, barcode: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, order_name, sku, barcode")
    .eq("company_id", companyId)
    .eq("barcode", barcode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CatalogIdentity | null) ?? null;
}

async function findBySku(supabase: Client, companyId: string, sku: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id, order_name, sku, barcode")
    .eq("company_id", companyId)
    .eq("sku", sku)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CatalogIdentity | null) ?? null;
}

function namesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function resolveSavedProductId(
  supabase: Client,
  companyId: string,
  draft: { id?: string; orderName: string; sku: string | null; barcode: string | null },
) {
  if (draft.id) return draft.id;

  if (draft.barcode) {
    const existing = await findByBarcode(supabase, companyId, draft.barcode);
    if (existing) {
      if (namesMatch(existing.order_name, draft.orderName) && (existing.sku ?? null) === (draft.sku ?? null)) {
        return existing.id;
      }
      throw new Error(`Barcode ${draft.barcode} is already used by ${catalogConflictLabel(existing)}.`);
    }
  }

  if (draft.sku) {
    const existing = await findBySku(supabase, companyId, draft.sku);
    if (existing) {
      if (namesMatch(existing.order_name, draft.orderName) && (existing.barcode ?? null) === (draft.barcode ?? null)) {
        return existing.id;
      }
      throw new Error(`SKU ${draft.sku} is already used by ${catalogConflictLabel(existing)}.`);
    }
  }

  if (!draft.barcode && !draft.sku) return undefined;

  const { data: sameName, error } = await supabase
    .from("products")
    .select("id, order_name, sku, barcode")
    .eq("company_id", companyId)
    .eq("order_name", draft.orderName.trim());
  if (error) throw new Error(error.message);

  const candidates = (sameName ?? []).filter((row) => {
    if ((row.sku ?? null) !== (draft.sku ?? null)) return false;
    return row.barcode == null || row.barcode === draft.barcode;
  });
  if (candidates.length === 1) return candidates[0].id;
  return undefined;
}

async function assertUniqueCodes(
  supabase: Client,
  companyId: string,
  productId: string | undefined,
  draft: { sku: string | null; barcode: string | null },
) {
  if (draft.barcode) {
    const existing = await findByBarcode(supabase, companyId, draft.barcode);
    if (existing && existing.id !== productId) {
      throw new Error(`Barcode ${draft.barcode} is already used by ${catalogConflictLabel(existing)}.`);
    }
  }
  if (draft.sku) {
    const existing = await findBySku(supabase, companyId, draft.sku);
    if (existing && existing.id !== productId) {
      throw new Error(`SKU ${draft.sku} is already used by ${catalogConflictLabel(existing)}.`);
    }
  }
}

async function stampCatalogSaved(companyId: string, email: string | undefined) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("companies")
    .update({
      catalog_saved_at: new Date().toISOString(),
      catalog_saved_by_email: email?.trim() || null,
    })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
}

export async function setProductPosAllowed(productId: string, allowed: boolean) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase
    .from("products")
    .update({ pos_allowed: allowed })
    .eq("id", productId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message || "Could not update this product's POS status.");
  revalidatePath("/admin/pos");
}

// Applies a tag-filtered batch decision in one go. Anything set here is a
// plain overwrite of pos_allowed, same as the single-product toggle — there
// is no separate "rule" record kept, so a product touched afterward by
// setProductPosAllowed (an exception) simply stays at whatever it was last
// set to until this bulk action is run again for a filter that includes it.
export async function setProductsPosAllowedBulk(productIds: string[], allowed: boolean) {
  const { supabase, companyId } = await requireAdmin();
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  // A single .in("id", ids) call URL-encodes every id into the query
  // string — with a few hundred+ UUIDs that string gets long enough to be
  // rejected outright (400 Bad Request) before Postgres ever sees it, so
  // this batches the update instead.
  const BATCH_SIZE = 200;
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from("products")
      .update({ pos_allowed: allowed })
      .eq("company_id", companyId)
      .in("id", batch);
    if (error) throw new Error(error.message || "Could not update these products' POS status.");
  }

  revalidatePath("/admin/pos");
}

export async function quickCreateProduct(input: {
  order_name: string;
  sku: string;
  brand: string;
  size: string;
  unit_cost_price: number;
  classification: ProductClassification | "";
}) {
  const { supabase, companyId, branch } = await requireBranch();
  const name = input.order_name.trim();
  if (!name) throw new Error("Product name is required.");

  const sku = normalizeOptionalText(input.sku);
  const brandId = await resolveBrandId(supabase, companyId, input.brand);

  const sizeRaw = input.size.trim();
  const parsedSize = parseSize(sizeRaw);
  if (sizeRaw && !parsedSize) {
    throw new Error("Size must look like 175ml, 175 ml, 1L, or 175g.");
  }

  const unitCost = Number.isFinite(input.unit_cost_price) ? input.unit_cost_price : 0;

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
      order_name: name,
      brand_id: brandId,
      unit_cost_price: unitCost,
      default_classification: input.classification || null,
      tax_rate_id: defaultTax?.id ?? null,
      size_label: parsedSize?.label ?? null,
      size_ml: parsedSize?.ml ?? null,
      // No tags exist yet at quick-create time, so this only ever
      // evaluates the "no excluded tag" branch today — kept explicit so
      // it stays correct if quick-create ever gains a tag field.
      pos_allowed: defaultPosAllowed([]),
    })
    .select("id, sku, order_name, name")
    .single();

  if (error) throw new Error(catalogWriteError(error));
  if (!created) throw new Error("Could not create the product.");

  const { error: branchError } = await supabase
    .from("product_branches")
    .insert({ product_id: created.id, branch_id: branch.id });
  if (branchError) throw branchError;

  revalidateCatalog();

  return {
    id: created.id,
    label: productLabel(created),
    sku: created.sku,
    unitCost,
  };
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
  unitCost: string;
  rrp: string;
  threshold: string;
  isSet: boolean;
  supplierIds: string[];
  components: { productId: string; quantity: number; allocatedCost?: number | null }[];
};

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

export async function saveProducts(drafts: ProductDraft[]) {
  const { supabase, companyId, user } = await requireAdmin();
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
  const validSupplierIds = await companySupplierIds(supabase, companyId);
  const resolveBrandIdCached = createBrandResolver(supabase, companyId);
  const saved: { clientKey: string | null; id: string }[] = [];
  const seenBarcodes = new Map<string, string>();
  const seenSkus = new Map<string, string>();

  for (const draft of rows) {
    const size = catalogSize(draft.size);
    const sku = draftText(draft.sku);
    const barcode = draftText(draft.barcode);
    const orderName = draft.orderName.trim();
    if (barcode) {
      const other = seenBarcodes.get(barcode);
      if (other) throw new Error(`Barcode ${barcode} is used more than once in this save (${other} and ${orderName}).`);
      seenBarcodes.set(barcode, orderName);
    }
    if (sku) {
      const other = seenSkus.get(sku);
      if (other) throw new Error(`SKU ${sku} is used more than once in this save (${other} and ${orderName}).`);
      seenSkus.set(sku, orderName);
    }
    const payload = {
      sku,
      barcode,
      order_name: orderName,
      name: draftText(draft.name),
      brand_id: await resolveBrandIdCached(draft.brand),
      brand_sub: draftText(draft.brandSub),
      unit_cost_price: parseMoney(draft.unitCost) ?? 0,
      rrp: parseMoney(draft.rrp),
      low_stock_threshold: parseMoney(draft.threshold),
      size_label: size.sizeLabel,
      size_ml: size.sizeMl,
      is_set: draft.isSet,
    };

    let productId = await resolveSavedProductId(supabase, companyId, {
      id: draft.id,
      orderName,
      sku,
      barcode,
    });
    // resolveSavedProductId already checked barcode/sku uniqueness itself
    // when it had to look an existing product up (no draft.id given) — only
    // the known-id update path still needs a fresh check here.
    if (draft.id) {
      await assertUniqueCodes(supabase, companyId, productId, { sku, barcode });
    }

    if (productId) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", productId)
        .eq("company_id", companyId);
      if (error) throw new Error(catalogWriteError(error));
    } else {
      const { data: created, error } = await supabase
        .from("products")
        .insert({
          ...payload,
          company_id: companyId,
          tax_rate_id: defaultTax?.id ?? null,
          // Tags are assigned separately, later, on /admin/branches — none
          // exist yet at creation, so this is the "no excluded tag" default.
          pos_allowed: defaultPosAllowed([]),
        })
        .select("id")
        .single();
      if (error) throw new Error(catalogWriteError(error));
      productId = created.id;
    }

    await syncProductSuppliers(supabase, productId, draft.supplierIds ?? [], validSupplierIds);
    if (draft.id || draft.isSet) {
      await persistProductComponents(supabase, companyId, {
        productId,
        isSet: draft.isSet,
        parentUnitCost: parseMoney(draft.unitCost) ?? 0,
        components: draft.components ?? [],
        replaceEmpty: false,
      });
      await syncBundleTag(supabase, companyId, productId, draft.isSet);
    }
    saved.push({ clientKey: draft.clientKey ?? null, id: productId });
  }

  await stampCatalogSaved(companyId, user.email);
  revalidateCatalog();
  return { saved };
}

async function productHasRows(
  supabase: Client,
  table:
    | "inventory_transactions"
    | "purchase_order_items"
    | "goods_receipt_items"
    | "retail_use_entries",
  productId: string,
) {
  const { data, error } = await supabase.from(table).select("product_id").eq("product_id", productId).limit(1);
  if (error) return { error: error.message, exists: false };
  return { exists: (data ?? []).length > 0 };
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export type ProductDeleteBlockItem = {
  label: string;
  href?: string;
  actionLabel?: string;
  branchId?: string;
};

export type ProductDeleteBlockGroup = {
  title: string;
  hint: string;
  items: ProductDeleteBlockItem[];
};

export type DeleteProductResult =
  | { ok: true }
  | { error: string }
  | { blocked: true; productLabel: string; groups: ProductDeleteBlockGroup[] };

function productDeleteError(error: { code?: string; message?: string }) {
  if (error.code === "23503") {
    return "This product cannot be deleted because it is used in stock, orders, counts, or a bundle.";
  }
  return error.message || "Could not delete that product.";
}

export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  const { supabase, companyId } = await requireAdmin();
  if (!id) return { error: "That product is missing." };

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, sku, name, order_name")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (productError) return { error: productError.message };
  if (!product) return { error: "That product was already removed." };

  const productLabel =
    product.order_name?.trim() || product.name?.trim() || product.sku?.trim() || "this product";

  const groups: ProductDeleteBlockGroup[] = [];

  const { data: countRows, error: countError } = await supabase
    .from("inventory_count_items")
    .select(
      "inventory_count_id, inventory_counts(id, count_date, status, company_id, branch_id, branches(name))",
    )
    .eq("product_id", id);
  if (countError) return { error: countError.message };

  const countsById = new Map<
    string,
    { id: string; countDate: string; status: string; salon: string; branchId: string }
  >();
  for (const row of countRows ?? []) {
    const count = asOne(row.inventory_counts);
    if (!count || count.company_id !== companyId) continue;
    const branch = asOne(count.branches);
    countsById.set(count.id, {
      id: count.id,
      countDate: count.count_date,
      status: count.status,
      salon: salonName(branch?.name ?? ""),
      branchId: count.branch_id,
    });
  }
  const counts = [...countsById.values()].sort((left, right) => {
    const draft = Number(right.status === "in_progress") - Number(left.status === "in_progress");
    if (draft !== 0) return draft;
    return right.countDate.localeCompare(left.countDate);
  });
  if (counts.length > 0) {
    groups.push({
      title: "Inventory movements",
      hint: "Complete, cancel or remove this product from inventory movements.",
      items: counts.map((count) => ({
        label: [count.salon || "Salon", formatDate(count.countDate), countStatusLabel(count.status)]
          .filter((part) => part && part !== "—")
          .join(" · "),
        href: `/counts/${count.id}`,
        actionLabel: "View count",
        branchId: count.branchId,
      })),
    });
  }

  const { data: bundleRows, error: bundleError } = await supabase
    .from("product_components")
    .select("set_product_id")
    .eq("component_product_id", id)
    .limit(8);
  if (bundleError) return { error: bundleError.message };
  if ((bundleRows ?? []).length > 0) {
    const bundleIds = [...new Set((bundleRows ?? []).map((row) => row.set_product_id))];
    const { data: bundles, error: namesError } = await supabase
      .from("products")
      .select("order_name, name")
      .eq("company_id", companyId)
      .in("id", bundleIds);
    if (namesError) return { error: namesError.message };
    const labels = (bundles ?? [])
      .map((row) => row.name?.trim() || row.order_name?.trim())
      .filter(Boolean);
    groups.push({
      title: "Composite products",
      hint: "Remove this product from those bundles first.",
      items: (labels.length > 0 ? labels : ["A bundle"]).map((label) => ({ label })),
    });
  }

  const checks = await Promise.all([
    productHasRows(supabase, "inventory_transactions", id),
    productHasRows(supabase, "purchase_order_items", id),
    productHasRows(supabase, "goods_receipt_items", id),
    productHasRows(supabase, "retail_use_entries", id),
  ]);
  const checkError = checks.find((check) => check.error)?.error;
  if (checkError) return { error: checkError };

  if (checks[0].exists && counts.length === 0) {
    groups.push({
      title: "Inventory movements",
      hint: "This product has stock ledger entries, so it cannot be hard-deleted.",
      items: [{ label: "Stock movements" }],
    });
  }

  const purchasing: ProductDeleteBlockItem[] = [];
  if (checks[1].exists) purchasing.push({ label: "Purchase order" });
  if (checks[2].exists) purchasing.push({ label: "Goods receipt" });
  if (purchasing.length > 0) {
    groups.push({
      title: "Open purchasing",
      hint: "Remove this product from those documents first.",
      items: purchasing,
    });
  }
  if (checks[3].exists) {
    groups.push({
      title: "Retail use",
      hint: "This product has retail-use records, so it cannot be hard-deleted.",
      items: [{ label: "Retail-use entries" }],
    });
  }

  if (groups.length > 0) {
    return { blocked: true, productLabel, groups };
  }

  const { data: removed, error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)
    .select("id");
  if (error) return { error: productDeleteError(error) };
  if (!removed?.length) return { error: "Could not delete that product." };

  revalidateCatalog();
  return { ok: true };
}

const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const PICTURE_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadProductPicture(productId: string, formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Choose an image to upload.");
  }
  const extension = PICTURE_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("Images must be PNG, JPEG, WEBP, or GIF.");
  }
  if (file.size > MAX_PICTURE_BYTES) {
    throw new Error("Image must be smaller than 5 MB.");
  }

  const { data: product, error: lookupError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message || "Could not find that product.");
  if (!product) throw new Error("Could not find that product.");

  const admin = createAdminClient();
  const path = `${companyId}/${productId}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("product-images")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message || "Could not upload the image.");

  const { data: publicUrlData } = admin.storage.from("product-images").getPublicUrl(path);
  const pictureUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("products")
    .update({ picture_url: pictureUrl })
    .eq("id", productId)
    .eq("company_id", companyId);
  if (updateError) throw new Error(updateError.message || "Could not save the image.");

  revalidateCatalog();
  return { pictureUrl };
}
