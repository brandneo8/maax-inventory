import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import type { ProductClassification } from "@/lib/labels";

const CLASSIFICATION_VALUES = new Set<ProductClassification>([
  "retail",
  "inhouse",
  "gwp",
  "retail_inhouse",
]);

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        kind?: unknown;
        productIds?: unknown;
        classification?: unknown;
        tagIds?: unknown;
        branchIds?: unknown;
      }
    | null;

  const productIds = asIdList(body?.productIds);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "Select at least one product." }, { status: 400 });
  }

  try {
    const { supabase, companyId } = await requireAdmin();

    if (body?.kind === "type") {
      const requested = typeof body.classification === "string" ? body.classification : "";
      const classification: ProductClassification | null = CLASSIFICATION_VALUES.has(
        requested as ProductClassification,
      )
        ? (requested as ProductClassification)
        : null;
      for (const ids of chunkIds(productIds)) {
        const { error } = await supabase
          .from("products")
          .update({ default_classification: classification })
          .eq("company_id", companyId)
          .in("id", ids);
        if (error) throw new Error(error.message);
      }
    } else if (body?.kind === "tags") {
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
      if (ownedIds.length === 0) {
        return NextResponse.json({ error: "No matching products to update." }, { status: 400 });
      }

      const requestedTagIds = asIdList(body.tagIds);
      let tagIds: string[] = [];
      if (requestedTagIds.length > 0) {
        const { data, error } = await supabase
          .from("tags")
          .select("id")
          .eq("company_id", companyId)
          .in("id", requestedTagIds);
        if (error) throw new Error(error.message);
        tagIds = (data ?? []).map((tag) => tag.id);
      }

      for (const ids of chunkIds(ownedIds)) {
        const { error } = await supabase.from("product_tags").delete().in("product_id", ids);
        if (error) throw new Error(error.message);
      }
      if (tagIds.length > 0) {
        for (const ids of chunkIds(ownedIds)) {
          const { error } = await supabase.from("product_tags").insert(
            ids.flatMap((productId) => tagIds.map((tagId) => ({ product_id: productId, tag_id: tagId }))),
          );
          if (error) throw new Error(error.message);
        }
      }
    } else if (body?.kind === "salons") {
      const { data: companyBranches, error: branchError } = await supabase
        .from("branches")
        .select("id")
        .eq("company_id", companyId);
      if (branchError) throw new Error(branchError.message);
      const valid = new Set((companyBranches ?? []).map((branch) => branch.id));
      const branchIds = asIdList(body.branchIds).filter((id) => valid.has(id));

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
      if (ownedIds.length === 0) {
        return NextResponse.json({ error: "No matching products to update." }, { status: 400 });
      }

      for (const ids of chunkIds(ownedIds)) {
        const { error } = await supabase.from("product_branches").delete().in("product_id", ids);
        if (error) throw new Error(error.message);
      }
      if (branchIds.length > 0) {
        for (const ids of chunkIds(ownedIds)) {
          const { error } = await supabase.from("product_branches").insert(
            ids.flatMap((productId) =>
              branchIds.map((branchId) => ({ product_id: productId, branch_id: branchId })),
            ),
          );
          if (error) throw new Error(error.message);
        }
      }
    } else {
      return NextResponse.json({ error: "Unknown bulk action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update products.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
