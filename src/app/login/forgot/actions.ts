"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPlaceholderEmail, normalizeUsername } from "@/lib/usernames";

/** This site's address as the browser sees it, for the link in the reset email. */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The account's email for what was typed: an email as is, or the account behind a username. */
async function emailFor(login: string) {
  if (login.includes("@")) return login.toLowerCase();
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

const SENT_MESSAGE =
  "If that account has an email address, a reset link is on its way. Open it in this browser to choose a new password.";

/**
 * Emails a password reset link. The same message shows whether or not the
 * account exists, so this can't be used to find out who has an account.
 * Accounts with only a username (no real email) can't get one — an admin
 * sets their password on the Users page instead.
 */
export async function requestPasswordReset(formData: FormData) {
  const login = String(formData.get("login") ?? "").trim();
  if (!login) redirect(`/login/forgot?error=${encodeURIComponent("Enter your username or email.")}`);

  const email = await emailFor(login);
  if (email && isPlaceholderEmail(email)) {
    redirect(
      `/login/forgot?error=${encodeURIComponent(
        "This account has no email address, so a reset link can't be sent. Ask an admin to set a new password for you on the Users page.",
      )}`,
    );
  }
  if (email) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await siteOrigin()}/auth/callback?next=/auth/reset`,
    });
    // Too many requests is worth saying; other failures look the same as success.
    if (error?.status === 429) {
      redirect(`/login/forgot?error=${encodeURIComponent("Too many reset emails were sent recently. Wait a few minutes and try again.")}`);
    }
  }
  redirect(`/login/forgot?sent=${encodeURIComponent(SENT_MESSAGE)}`);
}
