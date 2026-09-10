function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getSupabasePublicEnv() {
  // Next.js only inlines NEXT_PUBLIC_* into the browser bundle when the name is
  // a static property. `process.env[name]` is always empty on the client.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  return {
    url,
    publishableKey,
    isConfigured: Boolean(url && publishableKey),
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv().isConfigured;
}

export function getSetupStatus() {
  const publicEnv = getSupabasePublicEnv();

  return {
    supabaseUrl: Boolean(publicEnv.url),
    publishableKey: Boolean(publicEnv.publishableKey),
    serviceRoleKey: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
    projectId: Boolean(readEnv("SUPABASE_PROJECT_ID")),
  };
}
