import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

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
