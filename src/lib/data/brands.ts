import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Finds a brand by case-insensitive name, creating it if it doesn't exist yet. */
export async function resolveBrandId(supabase: Client, companyId: string, brandName: string) {
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
  if (error) throw new Error(error.message);
  return created.id;
}

/**
 * Wraps resolveBrandId with a name -> id cache scoped to one call site, so a
 * bulk save with many rows sharing a brand only resolves each distinct name
 * once instead of re-querying it on every row.
 */
export function createBrandResolver(supabase: Client, companyId: string) {
  const cache = new Map<string, string | null>();
  return async function resolveBrandIdCached(brandName: string) {
    const key = brandName.trim().toLowerCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key) ?? null;
    const id = await resolveBrandId(supabase, companyId, brandName);
    cache.set(key, id);
    return id;
  };
}
