import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const BATCH_SIZE = 200;

function chunkIds<T>(items: T[], size = BATCH_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export type PosTagRule = {
  id: string;
  label: string | null;
  allowed: boolean;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
};

export async function getPosTagRules(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("pos_tag_rules")
    .select("id, label, allowed, created_at, updated_at, pos_tag_rule_tags(tag_id)")
    .eq("company_id", companyId)
    .order("created_at");
  if (error) throw new Error(error.message || "Could not load POS tag rules.");

  return (data ?? []).map(
    (row): PosTagRule => ({
      id: row.id,
      label: row.label,
      allowed: row.allowed,
      tagIds: (row.pos_tag_rule_tags ?? []).map((link) => link.tag_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
}

async function getActivePosExcludeTagIds(supabase: Client, companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("pos_tag_rules")
    .select("pos_tag_rule_tags(tag_id)")
    .eq("company_id", companyId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not load the POS exclude rule.");
  return (data?.pos_tag_rule_tags ?? []).map((link) => link.tag_id);
}

/**
 * Re-applies the active "Exclude by tag" rule (see savePosTagRule) to just
 * these products — excluded if any of their tags matches the rule, allowed
 * otherwise. The rule is the one and only reason a product is excluded, so
 * this has to run any time a product's tags change outside of saving the
 * rule itself (tagging on /admin/branches, the bundle tag toggling on
 * catalog save) — otherwise pos_allowed silently drifts out of sync until
 * someone happens to revisit /admin/pos and re-save the rule.
 */
export async function reconcilePosAllowedForProducts(supabase: Client, companyId: string, productIds: string[]) {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  const excludeTagIds = await getActivePosExcludeTagIds(supabase, companyId);
  const excludedIds = new Set<string>();
  if (excludeTagIds.length > 0) {
    for (const idsChunk of chunkIds(ids)) {
      const { data, error } = await supabase
        .from("product_tags")
        .select("product_id")
        .in("product_id", idsChunk)
        .in("tag_id", excludeTagIds);
      if (error) throw new Error(error.message || "Could not check the POS exclude rule.");
      for (const row of data ?? []) excludedIds.add(row.product_id);
    }
  }

  const excludeIds = ids.filter((id) => excludedIds.has(id));
  const allowIds = ids.filter((id) => !excludedIds.has(id));

  for (const idsChunk of chunkIds(excludeIds)) {
    const { error } = await supabase
      .from("products")
      .update({ pos_allowed: false })
      .eq("company_id", companyId)
      .in("id", idsChunk);
    if (error) throw new Error(error.message || "Could not update these products' POS status.");
  }
  for (const idsChunk of chunkIds(allowIds)) {
    const { error } = await supabase
      .from("products")
      .update({ pos_allowed: true })
      .eq("company_id", companyId)
      .in("id", idsChunk);
    if (error) throw new Error(error.message || "Could not update these products' POS status.");
  }
}
