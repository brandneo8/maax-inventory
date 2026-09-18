"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ProductClassification } from "@/lib/labels";

const VALID_CLASSIFICATIONS = new Set<ProductClassification>(["retail", "inhouse", "gwp"]);

function revalidateBranchAssignment() {
  revalidatePath("/admin/branches");
  revalidatePath("/admin/products");
  revalidatePath("/home");
}

export async function addProductsToBranch(productIds: string[], branchId: string) {
  const { supabase, companyId } = await requireAdmin();
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return;

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) throw new Error("That salon was not found.");

  const { data: owned, error: ownedError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .in("id", wanted);
  if (ownedError) throw new Error(ownedError.message);
  const ownedIds = new Set((owned ?? []).map((row) => row.id));

  const { data: existing, error: existingError } = await supabase
    .from("product_branches")
    .select("product_id")
    .eq("branch_id", branchId)
    .in("product_id", wanted);
  if (existingError) throw new Error(existingError.message);
  const alreadyAssigned = new Set((existing ?? []).map((row) => row.product_id));

  const missing = wanted.filter((id) => ownedIds.has(id) && !alreadyAssigned.has(id));
  if (missing.length === 0) return;

  const { error: insertError } = await supabase
    .from("product_branches")
    .insert(missing.map((productId) => ({ product_id: productId, branch_id: branchId })));
  if (insertError) throw new Error(insertError.message);

  revalidateBranchAssignment();
}

export async function removeProductFromBranch(productId: string, branchId: string) {
  const { supabase, companyId } = await requireAdmin();
  if (!productId || !branchId) throw new Error("Missing product or salon.");

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) throw new Error("That salon was not found.");

  const { error } = await supabase
    .from("product_branches")
    .delete()
    .eq("product_id", productId)
    .eq("branch_id", branchId);
  if (error) throw new Error(error.message);

  revalidateBranchAssignment();
}

export async function updateProductClassificationForBranch(
  productId: string,
  branchId: string,
  classifications: ProductClassification[],
) {
  const { supabase, companyId } = await requireAdmin();

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) throw new Error("That salon was not found.");

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("Could not find that product.");

  const wanted = [...new Set(classifications.filter((value) => VALID_CLASSIFICATIONS.has(value)))];

  const { error: deleteError } = await supabase
    .from("product_branch_classifications")
    .delete()
    .eq("product_id", productId)
    .eq("branch_id", branchId);
  if (deleteError) throw new Error(deleteError.message || "Could not update the product type.");

  if (wanted.length > 0) {
    const { error: insertError } = await supabase
      .from("product_branch_classifications")
      .insert(wanted.map((classification) => ({ product_id: productId, branch_id: branchId, classification })));
    if (insertError) throw new Error(insertError.message || "Could not update the product type.");
  }

  revalidateBranchAssignment();
}

export async function bulkAddClassificationToBranch(
  productIds: string[],
  branchId: string,
  classification: ProductClassification,
) {
  const { supabase, companyId } = await requireAdmin();
  if (!VALID_CLASSIFICATIONS.has(classification)) throw new Error("Invalid product type.");
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return;

  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) throw new Error("That salon was not found.");

  const { data: owned, error: ownedError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .in("id", wanted);
  if (ownedError) throw new Error(ownedError.message);
  const ownedIds = new Set((owned ?? []).map((row) => row.id));
  const targetIds = wanted.filter((id) => ownedIds.has(id));
  if (targetIds.length === 0) return;

  const { error: insertError } = await supabase.from("product_branch_classifications").upsert(
    targetIds.map((productId) => ({ product_id: productId, branch_id: branchId, classification })),
    { onConflict: "product_id,branch_id,classification", ignoreDuplicates: true },
  );
  if (insertError) throw new Error(insertError.message || "Could not update the product type.");

  revalidateBranchAssignment();
}

export async function bulkAddTagToProducts(productIds: string[], tagId: string) {
  const { supabase, companyId } = await requireAdmin();
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0 || !tagId) return;

  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (tagError) throw new Error(tagError.message);
  if (!tag) throw new Error("That tag was not found.");

  const { data: owned, error: ownedError } = await supabase
    .from("products")
    .select("id")
    .eq("company_id", companyId)
    .in("id", wanted);
  if (ownedError) throw new Error(ownedError.message);
  const ownedIds = new Set((owned ?? []).map((row) => row.id));
  const targetIds = wanted.filter((id) => ownedIds.has(id));
  if (targetIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("product_tags")
    .upsert(
      targetIds.map((productId) => ({ product_id: productId, tag_id: tagId })),
      { onConflict: "product_id,tag_id", ignoreDuplicates: true },
    );
  if (insertError) throw new Error(insertError.message || "Could not add the tag.");

  revalidateBranchAssignment();
}

export async function createTag(name: string) {
  const { supabase, companyId } = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name cannot be empty.");

  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("id, name")
    .eq("company_id", companyId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { id: existing.id, label: existing.name };

  const { data: created, error: createError } = await supabase
    .from("tags")
    .insert({ company_id: companyId, name: trimmed })
    .select("id, name")
    .single();
  if (createError) throw new Error(createError.message || "Could not create tag.");

  revalidatePath("/admin/branches");
  return { id: created.id, label: created.name };
}

export async function updateProductTags(productId: string, tagIds: string[]) {
  const { supabase, companyId } = await requireAdmin();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) throw new Error("Could not find that product.");

  const requested = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))];
  let ownedTagIds: string[] = [];
  if (requested.length > 0) {
    const { data: ownedTags, error: tagError } = await supabase
      .from("tags")
      .select("id")
      .eq("company_id", companyId)
      .in("id", requested);
    if (tagError) throw new Error(tagError.message);
    ownedTagIds = (ownedTags ?? []).map((tag) => tag.id);
  }

  const { error: deleteError } = await supabase.from("product_tags").delete().eq("product_id", productId);
  if (deleteError) throw new Error(deleteError.message || "Could not update tags.");

  if (ownedTagIds.length > 0) {
    const { error: insertError } = await supabase
      .from("product_tags")
      .insert(ownedTagIds.map((tagId) => ({ product_id: productId, tag_id: tagId })));
    if (insertError) throw new Error(insertError.message || "Could not update tags.");
  }

  revalidateBranchAssignment();
}
