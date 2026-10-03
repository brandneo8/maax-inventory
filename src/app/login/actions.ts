"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername } from "@/lib/usernames";

/** The sign-in email for what was typed: an email as is, or the account behind a username. */
async function emailForLogin(login: string) {
  if (login.includes("@")) return login;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("user_id")
    .eq("username", normalizeUsername(login))
    .maybeSingle();
  if (!profile) return null;
  const { data } = await admin.auth.admin.getUserById(profile.user_id);
  return data.user?.email ?? null;
}

export async function signIn(formData: FormData) {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = await emailForLogin(login);
  // Same message whether the username exists or not.
  if (!email) redirect(`/login?error=${encodeURIComponent("Invalid login credentials")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
