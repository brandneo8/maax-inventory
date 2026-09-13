"use server";

import { revalidatePath } from "next/cache";
import { requireBranch } from "@/lib/auth";
import type { ProductClassification } from "@/lib/labels";

const VALID_CLASSIFICATIONS = new Set<ProductClassification>(["retail", "inhouse", "gwp"]);

function revalidateCatalog() {
  revalidatePath("/home/products");
  revalidatePath("/home/tunai");
  revalidatePath("/home");
}

function chunkIds(ids: string[], size = 200) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export async function updateBranchProductClassifications(
  productId: string,
  classifications: ProductClassification[],
) {
  const { supabase, companyId, branch } = await requireBranch();

  const { data: product, error: lookupError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message || "Could not find that product.");
  if (!product) throw new Error("Could not find that product.");

  const wanted = [...new Set(classifications.filter((value) => VALID_CLASSIFICATIONS.has(value)))];

  const { error: deleteError } = await supabase
    .from("product_branch_classifications")
    .delete()
    .eq("product_id", productId)
    .eq("branch_id", branch.id);
  if (deleteError) throw new Error(deleteError.message || "Could not update the product type.");

  if (wanted.length > 0) {
    const { error: insertError } = await supabase.from("product_branch_classifications").insert(
      wanted.map((classification) => ({ product_id: productId, branch_id: branch.id, classification })),
    );
    if (insertError) throw new Error(insertError.message || "Could not update the product type.");
  }

  revalidateCatalog();
}

export async function bulkUpdateBranchProductClassifications(
  productIds: string[],
  classifications: ProductClassification[],
) {
  const { supabase, companyId, branch } = await requireBranch();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("Select at least one product.");
  }

  const ownedIds: string[] = [];
  for (const ids2 of chunkIds(ids)) {
    const { data, error } = await supabase.from("products").select("id").eq("company_id", companyId).in("id", ids2);
    if (error) throw new Error(error.message || "Could not find those products.");
    ownedIds.push(...(data ?? []).map((row) => row.id));
  }
  if (ownedIds.length === 0) {
    throw new Error("No matching products to update.");
  }

  const wanted = [...new Set(classifications.filter((value) => VALID_CLASSIFICATIONS.has(value)))];

  for (const ids2 of chunkIds(ownedIds)) {
    const { error: deleteError } = await supabase
      .from("product_branch_classifications")
      .delete()
      .eq("branch_id", branch.id)
      .in("product_id", ids2);
    if (deleteError) throw new Error(deleteError.message || "Could not update product types.");
  }

  if (wanted.length > 0) {
    for (const ids2 of chunkIds(ownedIds)) {
      const { error: insertError } = await supabase.from("product_branch_classifications").insert(
        ids2.flatMap((productId) =>
          wanted.map((classification) => ({ product_id: productId, branch_id: branch.id, classification })),
        ),
      );
      if (insertError) throw new Error(insertError.message || "Could not update product types.");
    }
  }

  revalidateCatalog();
  return { updated: ownedIds.length };
}
