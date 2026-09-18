import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeOptionalText, parseMoney } from "@/lib/catalog-import";
import { resolveBrandId } from "@/lib/data/brands";
import { parseSize } from "@/lib/product-size";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

function asIdList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))];
}

function chunkIds(ids: string[], size = 200) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function hasField(fields: object, key: string) {
  return Object.prototype.hasOwnProperty.call(fields, key);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function revalidateCatalog() {
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/home");
  revalidatePath("/stock-in");
  revalidatePath("/orders");
  revalidatePath("/reports");
}

async function ownedProductIds(supabase: Client, companyId: string, productIds: string[]) {
  const ownedIds: string[] = [];
  for (const ids of chunkIds(productIds)) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    ownedIds.push(...(data ?? []).map((product) => product.id));
  }
  return ownedIds;
}

async function applySuppliers(supabase: Client, companyId: string, ownedIds: string[], supplierId: string) {
  const { data: companySuppliers, error: supplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", companyId);
  if (supplierError) throw new Error(supplierError.message);
  const valid = new Set((companySuppliers ?? []).map((supplier) => supplier.id));
  const nextId = supplierId && valid.has(supplierId) ? supplierId : "";

  for (const ids of chunkIds(ownedIds)) {
    const { error } = await supabase.from("supplier_products").delete().in("product_id", ids);
    if (error) throw new Error(error.message);
  }
  if (nextId) {
    for (const ids of chunkIds(ownedIds)) {
      const { error } = await supabase.from("supplier_products").insert(
        ids.map((productId) => ({
          product_id: productId,
          supplier_id: nextId,
          is_preferred: true,
        })),
      );
      if (error) throw new Error(error.message);
    }
  }
}

type BulkFields = Record<string, unknown>;

async function applyEdit(
  supabase: Client,
  companyId: string,
  productIds: string[],
  fields: BulkFields,
) {
  const ownedIds = await ownedProductIds(supabase, companyId, productIds);
  if (ownedIds.length === 0) {
    throw new Error("No matching products to update.");
  }

  const productPatch: Record<string, unknown> = {};

  if (hasField(fields, "brand")) {
    productPatch.brand_id = await resolveBrandId(supabase, companyId, asString(fields.brand));
  }
  if (hasField(fields, "brandSub")) {
    productPatch.brand_sub = normalizeOptionalText(asString(fields.brandSub));
  }
  if (hasField(fields, "size")) {
    const raw = asString(fields.size).trim();
    if (!raw) {
      productPatch.size_label = null;
      productPatch.size_ml = null;
    } else {
      const parsed = parseSize(raw);
      if (!parsed) {
        throw new Error("Size must look like 175ml, 175 ml, 1L, or 175g.");
      }
      productPatch.size_label = parsed.label;
      productPatch.size_ml = parsed.ml;
    }
  }
  if (hasField(fields, "threshold")) {
    const raw = asString(fields.threshold).trim();
    if (!raw) {
      productPatch.low_stock_threshold = null;
    } else {
      const amount = parseMoney(raw);
      if (amount == null) {
        throw new Error("Threshold must be a number.");
      }
      productPatch.low_stock_threshold = amount;
    }
  }

  if (Object.keys(productPatch).length > 0) {
    const payload = productPatch as {
      brand_id?: string | null;
      brand_sub?: string | null;
      size_label?: string | null;
      size_ml?: number | null;
      low_stock_threshold?: number | null;
    };
    for (const ids of chunkIds(ownedIds)) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("company_id", companyId)
        .in("id", ids);
      if (error) throw new Error(error.message);
    }
  }

  if (hasField(fields, "supplierId")) {
    await applySuppliers(supabase, companyId, ownedIds, asString(fields.supplierId).trim());
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        kind?: unknown;
        productIds?: unknown;
        fields?: unknown;
      }
    | null;

  const productIds = asIdList(body?.productIds);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "Select at least one product." }, { status: 400 });
  }

  try {
    const { supabase, companyId } = await requireAdmin();

    if (body?.kind === "edit") {
      const fields =
        body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
          ? (body.fields as BulkFields)
          : null;
      if (!fields || Object.keys(fields).length === 0) {
        return NextResponse.json({ error: "Add at least one field to apply." }, { status: 400 });
      }
      await applyEdit(supabase, companyId, productIds, fields);
    } else {
      return NextResponse.json({ error: "Unknown bulk action." }, { status: 400 });
    }

    revalidateCatalog();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update products.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
