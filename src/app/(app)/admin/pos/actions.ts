"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { catalogTax, confirmedRetailPrice } from "@/lib/catalog-pricing";
import { getTaxRates } from "@/lib/data/lookups";
import { getCatalogProducts } from "@/lib/data/products";
import { productDisplayName } from "@/lib/format";
import { classificationTagsLabel } from "@/lib/labels";

const BATCH_SIZE = 200;
const PAGE_SIZE = 1000;

type Client = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function getActiveProductIds(supabase: Client, companyId: string) {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Could not load the product catalog.");
    for (const row of data ?? []) ids.push(row.id);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function getProductIdsForTags(supabase: Client, tagIds: string[]) {
  const ids = new Set<string>();
  for (const tagId of tagIds) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("product_tags")
        .select("product_id")
        .eq("tag_id", tagId)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message || "Could not look up products for these tags.");
      for (const row of data ?? []) ids.add(row.product_id);
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return ids;
}

async function setPosAllowedForIds(supabase: Client, companyId: string, ids: string[], allowed: boolean) {
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from("products")
      .update({ pos_allowed: allowed })
      .eq("company_id", companyId)
      .in("id", batch);
    if (error) throw new Error(error.message || "Could not update these products' POS status.");
  }
}

/**
 * Makes pos_allowed a pure function of "does this product carry any of
 * tagIds": excluded if it matches, allowed otherwise — for every active
 * product in the company, not just the ones newly touched. This is the
 * one and only reason a product is excluded from POS right now, so
 * re-saving the filter has to correct drift in both directions, not just
 * apply new exclusions on top of whatever pos_allowed happened to already
 * be.
 */
async function reconcilePosAllowedByTags(supabase: Client, companyId: string, tagIds: string[]) {
  const [allIds, matchedIds] = await Promise.all([
    getActiveProductIds(supabase, companyId),
    getProductIdsForTags(supabase, tagIds),
  ]);
  const excludeIds = allIds.filter((id) => matchedIds.has(id));
  const allowIds = allIds.filter((id) => !matchedIds.has(id));
  await Promise.all([
    setPosAllowedForIds(supabase, companyId, excludeIds, false),
    setPosAllowedForIds(supabase, companyId, allowIds, true),
  ]);
}

// Exclude-only, deliberately: an earlier version let a rule either include
// or exclude by tag, which was confusing (an "include" rule reads as "the
// only allowed products," which isn't how POS allow-listing actually
// works here — everything is allowed by default, tags carve exclusions
// out of that).
export async function savePosTagRule(input: { id: string | null; label: string; tagIds: string[] }) {
  const { supabase, companyId } = await requireAdmin();
  const tagIds = [...new Set(input.tagIds)];
  if (tagIds.length === 0) {
    throw new Error("Pick at least one tag for this rule.");
  }
  const label = input.label.trim() || null;

  let ruleId = input.id;
  if (ruleId) {
    const { error } = await supabase
      .from("pos_tag_rules")
      .update({ label, updated_at: new Date().toISOString() })
      .eq("id", ruleId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message || "Could not save this rule.");

    const { error: clearError } = await supabase.from("pos_tag_rule_tags").delete().eq("rule_id", ruleId);
    if (clearError) throw clearError;
  } else {
    const { data: created, error } = await supabase
      .from("pos_tag_rules")
      .insert({ company_id: companyId, label, allowed: false })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message || "Could not create this rule.");
    ruleId = created.id;
  }

  const { error: linkError } = await supabase
    .from("pos_tag_rule_tags")
    .insert(tagIds.map((tagId) => ({ rule_id: ruleId, tag_id: tagId })));
  if (linkError) throw new Error(linkError.message || "Could not save this rule's tags.");

  await reconcilePosAllowedByTags(supabase, companyId, tagIds);

  revalidatePath("/admin/pos");
  return { id: ruleId };
}

export type PosBranchExportRow = {
  SKU: string | null;
  Name: string;
  Size: string;
  "Name with size": string;
  Type: string;
  "Cost incl. tax": string;
  "Retail price": string;
};

/**
 * Rows for one salon's POS-allowed CSV, read fresh from the database at
 * call time rather than from whatever the admin/pos page happened to have
 * loaded in the browser — branch tagging (product_branches) can change on
 * /admin/branches at any point while this page sits open, so the download
 * itself has to re-fetch instead of trusting stale client state.
 */
export async function getPosBranchExportRows(branchId: string): Promise<PosBranchExportRow[]> {
  const { supabase, companyId } = await requireAdmin();
  const [products, taxRates] = await Promise.all([
    getCatalogProducts(supabase, companyId),
    getTaxRates(supabase, companyId),
  ]);
  const gstRate = Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9);

  return products
    .filter((product) => product.posAllowed && Boolean(product.sku) && product.branchIds.includes(branchId))
    .map((product) => {
      const name = productDisplayName(product) || product.sku || "";
      const typeLabel = classificationTagsLabel([...new Set(Object.values(product.classificationsByBranch).flat())]);
      return {
        SKU: product.sku,
        Name: name,
        Size: product.sizeLabel || "",
        "Name with size": product.sizeLabel ? `${name} ${product.sizeLabel}`.trim() : name,
        Type: typeLabel || "",
        "Cost incl. tax": catalogTax(product.unitCost, true, gstRate).unitCostWithTax.toFixed(2),
        "Retail price": confirmedRetailPrice(product.unitCost, product.rrp).toFixed(2),
      };
    })
    .sort((a, b) => a.Name.localeCompare(b.Name, undefined, { sensitivity: "base" }));
}

export async function deletePosTagRule(ruleId: string) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase.from("pos_tag_rules").delete().eq("id", ruleId).eq("company_id", companyId);
  if (error) throw new Error(error.message || "Could not delete this rule.");

  // No rule left means no reason for anything to be excluded right now.
  const allIds = await getActiveProductIds(supabase, companyId);
  await setPosAllowedForIds(supabase, companyId, allIds, true);

  revalidatePath("/admin/pos");
}
