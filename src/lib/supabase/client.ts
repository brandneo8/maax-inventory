import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "./types";

export { isSupabaseConfigured };

export function createClient() {
  const { url, publishableKey, isConfigured } = getSupabasePublicEnv();

  if (!isConfigured) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) on Vercel, then redeploy.",
    );
  }

  return createBrowserClient<Database>(url, publishableKey);
}
