import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "./types";

export { isSupabaseConfigured };

export function createClient() {
  const { url, publishableKey, isConfigured } = getSupabasePublicEnv();

  if (!isConfigured) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }

  return createBrowserClient<Database>(url, publishableKey);
}
