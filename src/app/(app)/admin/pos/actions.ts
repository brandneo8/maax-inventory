"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

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

export async function deletePosTagRule(ruleId: string) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase.from("pos_tag_rules").delete().eq("id", ruleId).eq("company_id", companyId);
  if (error) throw new Error(error.message || "Could not delete this rule.");

  // No rule left means no reason for anything to be excluded right now.
  const allIds = await getActiveProductIds(supabase, companyId);
  await setPosAllowedForIds(supabase, companyId, allIds, true);

  revalidatePath("/admin/pos");
}
