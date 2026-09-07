function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getSupabasePublicEnv() {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

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
  return {
    supabaseUrl: Boolean(readEnv("NEXT_PUBLIC_SUPABASE_URL")),
    publishableKey: Boolean(
      readEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    ),
    serviceRoleKey: Boolean(readEnv("SUPABASE_SERVICE_ROLE_KEY")),
    projectId: Boolean(readEnv("SUPABASE_PROJECT_ID")),
  };
}
