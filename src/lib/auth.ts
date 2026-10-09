import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salonName } from "@/lib/labels";
import { realEmail } from "@/lib/usernames";

export const DEFAULT_ADMIN_EMAIL = "brand1998@gmail.com";

/**
 * Admins can use every page. Stylists only see Home and Reports. Any role
 * other than "admin" (including the older "member") is treated as a stylist.
 */
export type UserRole = "admin" | "stylist";
export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "stylist", label: "Stylist" },
];
export function roleOf(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "stylist";
}
export const BRANCH_COOKIE = "maax-branch-id";

export type BranchOption = {
  id: string;
  name: string;
  displayName: string;
};

async function grantDefaultAdminAccess(userId: string, email: string | undefined) {
  if (email?.toLowerCase() !== DEFAULT_ADMIN_EMAIL) return;

  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id").eq("name", "MAAX PTE LTD").single();
  if (!company) return;

  await admin.from("company_users").upsert(
    { company_id: company.id, user_id: userId, role: "admin" },
    { onConflict: "company_id,user_id" },
  );

  const { data: branches } = await admin.from("branches").select("id").eq("company_id", company.id);
  if (!branches?.length) return;

  await admin.from("branch_users").upsert(
    branches.map((branch) => ({ branch_id: branch.id, user_id: userId })),
    { onConflict: "branch_id,user_id" },
  );
}

async function loadUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The username is only needed for the display name of someone without a
  // real email yet, and doesn't depend on the membership — so it's read
  // alongside it, and only when needed.
  const [{ data: firstMembership }, { data: profile }] = await Promise.all([
    supabase.from("company_users").select("company_id, role").eq("user_id", user.id).limit(1).maybeSingle(),
    realEmail(user.email)
      ? Promise.resolve({ data: null })
      : supabase.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle(),
  ]);
  let membership = firstMembership;

  if (!membership) {
    await grantDefaultAdminAccess(user.id, user.email);
    ({ data: membership } = await supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle());
  }

  if (!membership) {
    const admin = createAdminClient();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("name", "MAAX PTE LTD")
      .single();

    if (companyError || !company) {
      throw new Error("MAAX PTE LTD company row is missing. Re-run the salon schema seed.");
    }

    // Someone signing in without an account set up by an admin starts as a
    // stylist with no salon access — they see the blocked screen until an
    // admin grants a salon on the Users page.
    const role = user.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL ? "admin" : "stylist";
    await admin.from("company_users").upsert(
      { company_id: company.id, user_id: user.id, role },
      { onConflict: "company_id,user_id" },
    );
    membership = { company_id: company.id, role };
  }

  const isAdmin = membership.role === "admin";
  const [allowedBranches, cookieStore] = await Promise.all([
    loadAllowedBranches(supabase, user.id, membership.company_id, isAdmin),
    cookies(),
  ]);

  /** What to show for the signed-in person: their email, or username if they have none yet. */
  const displayName = realEmail(user.email) || profile?.username || user.email || "";

  const requestedId = cookieStore.get(BRANCH_COOKIE)?.value;
  const branch = allowedBranches.find((item) => item.id === requestedId) ?? allowedBranches[0] ?? null;

  return {
    supabase,
    user,
    companyId: membership.company_id,
    role: membership.role,
    displayName,
    isAdmin,
    allowedBranches,
    branch,
  };
}

export const requireUser = cache(loadUser);

function sortSalonBranches(branches: BranchOption[]) {
  const rank = (name: string) => (name === "Min" ? 0 : name === "Kin" ? 1 : 2);
  return [...branches].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

async function loadAllowedBranches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  companyId: string,
  isAdmin: boolean,
) {
  if (isAdmin) {
    const { data, error } = await supabase.from("branches").select("id, name").eq("company_id", companyId);
    if (error) throw error;
    return sortSalonBranches(
      (data ?? []).map((branch) => ({
        id: branch.id,
        name: branch.name,
        displayName: salonName(branch.name),
      })),
    );
  }

  const { data: branchRows, error } = await supabase
    .from("branch_users")
    .select("branch_id, branches!inner(id, name, company_id)")
    .eq("user_id", userId)
    .eq("branches.company_id", companyId);

  if (error) throw error;

  return sortSalonBranches(
    (branchRows ?? []).flatMap((row) => {
      const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
      if (!branch) return [];
      return [{ id: branch.id, name: branch.name, displayName: salonName(branch.name) }];
    }),
  );
}

export async function requireBranch() {
  const ctx = await requireUser();
  if (!ctx.branch) {
    redirect(ctx.isAdmin ? "/admin" : "/home");
  }
  return { ...ctx, branch: ctx.branch };
}

/** requireBranch for admin-only pages and actions: stylists are sent Home. */
export async function requireAdminBranch() {
  const ctx = await requireBranch();
  if (!ctx.isAdmin) {
    redirect("/home");
  }
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.isAdmin) {
    redirect("/home");
  }
  return ctx;
}
