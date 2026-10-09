"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_ADMIN_EMAIL, requireAdmin, roleOf, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { USERNAME_PATTERN, normalizeUsername, placeholderEmail, realEmail } from "@/lib/usernames";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RULE = "Usernames are 3–30 characters: letters, numbers, dots, dashes or underscores.";

function usersPage(params: Record<string, string>) {
  return `/admin/users?${new URLSearchParams(params).toString()}`;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Every sign-in's email, keyed by user id. */
async function authEmails(admin: Admin) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return new Map((data?.users ?? []).map((account) => [account.id, account.email ?? ""]));
}

/** Whether a username is free (optionally ignoring one user's own). */
async function usernameTaken(admin: Admin, username: string, exceptUserId?: string) {
  const { data, error } = await admin.from("user_profiles").select("user_id").eq("username", username).maybeSingle();
  if (error) throw error;
  return Boolean(data && data.user_id !== exceptUserId);
}

/**
 * Saves the Users table: each user's username, email, role (Admin / Stylist)
 * and salons. A username-only account (placeholder email) gets its real
 * email when one is typed in. You can't take Admin away from yourself or
 * from the default admin, and the default admin's email can't be changed,
 * so the app always keeps an admin.
 */
export async function saveBranchAccess(formData: FormData) {
  const { supabase, companyId, user } = await requireAdmin();

  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId);
  if (branchError) throw branchError;

  const { data: members, error: memberError } = await supabase
    .from("company_users")
    .select("user_id, role")
    .eq("company_id", companyId);
  if (memberError) throw memberError;

  const admin = createAdminClient();
  const emailById = await authEmails(admin);
  const { data: profiles, error: profilesError } = await admin.from("user_profiles").select("user_id, username");
  if (profilesError) throw profilesError;
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.username]));

  // Check every username first, so a clash doesn't leave half the table saved.
  const requestedUsernames = new Map<string, string>();
  for (const member of members ?? []) {
    const raw = formData.get(`username:${member.user_id}`);
    if (typeof raw !== "string") continue;
    const username = normalizeUsername(raw);
    if (!username) {
      if (usernameById.has(member.user_id)) redirect(usersPage({ error: "A username can't be cleared once set." }));
      continue;
    }
    if (!USERNAME_PATTERN.test(username)) redirect(usersPage({ error: USERNAME_RULE }));
    if ([...requestedUsernames.values()].includes(username) || (await usernameTaken(admin, username, member.user_id))) {
      redirect(usersPage({ error: `The username "${username}" is already taken.` }));
    }
    requestedUsernames.set(member.user_id, username);
  }

  for (const member of members ?? []) {
    const currentEmail = emailById.get(member.user_id) ?? "";
    const isDefaultAdmin = currentEmail.toLowerCase() === DEFAULT_ADMIN_EMAIL;

    // Username
    const username = requestedUsernames.get(member.user_id);
    if (username && username !== usernameById.get(member.user_id)) {
      const { error } = await admin
        .from("user_profiles")
        .upsert({ user_id: member.user_id, username }, { onConflict: "user_id" });
      if (error) throw error;
    }

    // Email: set or change it (never cleared back to nothing).
    const rawEmail = formData.get(`email:${member.user_id}`);
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    if (!isDefaultAdmin && email && email !== realEmail(currentEmail).toLowerCase()) {
      if (!EMAIL_PATTERN.test(email)) redirect(usersPage({ error: `"${email}" isn't a valid email address.` }));
      const { error } = await admin.auth.admin.updateUserById(member.user_id, { email, email_confirm: true });
      if (error) redirect(usersPage({ error: `Couldn't set ${email}: ${error.message}` }));
    }

    // Role
    const requested = formData.get(`role:${member.user_id}`);
    const locked = member.user_id === user.id || isDefaultAdmin;
    const role: UserRole = locked ? "admin" : roleOf(typeof requested === "string" ? requested : member.role);
    if (member.role !== role) {
      const { error } = await admin
        .from("company_users")
        .update({ role })
        .eq("company_id", companyId)
        .eq("user_id", member.user_id);
      if (error) throw error;
    }

    // Salons
    const selected = (branches ?? []).filter((branch) => formData.get(`branch:${member.user_id}:${branch.id}`) === "on");
    await admin.from("branch_users").delete().eq("user_id", member.user_id).in(
      "branch_id",
      (branches ?? []).map((branch) => branch.id),
    );
    if (selected.length > 0) {
      const { error } = await admin.from("branch_users").insert(
        selected.map((branch) => ({ branch_id: branch.id, user_id: member.user_id })),
      );
      if (error) throw error;
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
  redirect(usersPage({ saved: "1" }));
}

/**
 * Adds someone with a username and a starting password (shared with them),
 * plus an email if known, a role and their salons. Without an email the
 * account signs in by username (it gets a placeholder address until a real
 * one is added on the Users table). If the email already has a sign-in (e.g.
 * they tried to sign up), that account is added instead, password unchanged.
 */
export async function createUserAccount(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = roleOf(String(formData.get("role") ?? "stylist"));

  if (!USERNAME_PATTERN.test(username)) redirect(usersPage({ error: USERNAME_RULE }));
  if (email && !EMAIL_PATTERN.test(email)) redirect(usersPage({ error: "Enter a valid email address, or leave it blank." }));

  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id")
    .eq("company_id", companyId);
  if (branchError) throw branchError;
  const branchIds = (branches ?? []).map((branch) => branch.id).filter((id) => formData.get(`new-branch:${id}`) === "on");
  if (role === "stylist" && branchIds.length === 0) {
    redirect(usersPage({ error: "Pick at least one salon for a stylist." }));
  }

  const admin = createAdminClient();
  const emails = await authEmails(admin);
  let userId = email ? [...emails].find(([, address]) => address.toLowerCase() === email)?.[0] : undefined;
  if (await usernameTaken(admin, username, userId)) {
    redirect(usersPage({ error: `The username "${username}" is already taken.` }));
  }

  if (!userId) {
    if (password.length < 8) redirect(usersPage({ error: "The starting password needs at least 8 characters." }));
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email || placeholderEmail(username),
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      redirect(usersPage({ error: createError?.message || "Could not create that user." }));
    }
    userId = created.user.id;
  }

  const { error: profileError } = await admin
    .from("user_profiles")
    .upsert({ user_id: userId, username }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  const { error: memberError } = await admin
    .from("company_users")
    .upsert({ company_id: companyId, user_id: userId, role }, { onConflict: "company_id,user_id" });
  if (memberError) throw memberError;

  if (branchIds.length > 0) {
    const { error: accessError } = await admin
      .from("branch_users")
      .upsert(
        branchIds.map((branchId) => ({ branch_id: branchId, user_id: userId })),
        { onConflict: "branch_id,user_id" },
      );
    if (accessError) throw accessError;
  }

  revalidatePath("/admin/users");
  redirect(usersPage({ created: username }));
}

/**
 * Sets a new password for someone in this company — for a forgotten password
 * on an account without an email, or when the reset email can't be used.
 * Share it with them; they can change it later through Forgot password.
 */
export async function setUserPassword(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) redirect(usersPage({ error: "Pick whose password to set." }));
  if (password.length < 8) redirect(usersPage({ error: "The new password needs at least 8 characters." }));

  const { data: member, error: memberError } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) redirect(usersPage({ error: "That user isn't in this company." }));

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) redirect(usersPage({ error: error.message || "Could not set the password." }));

  const [{ data: profile }, { data: account }] = await Promise.all([
    admin.from("user_profiles").select("username").eq("user_id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  redirect(usersPage({ passwordSet: profile?.username || realEmail(account.user?.email) || "the user" }));
}
