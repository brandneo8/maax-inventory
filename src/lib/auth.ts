import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { salonName } from "@/lib/labels";

export const DEFAULT_ADMIN_EMAIL = "brand1998@gmail.com";
export const BRANCH_COOKIE = "maax-branch-id";
export const ADMIN_EDIT_COOKIE = "maax-admin-edit";

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

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await grantDefaultAdminAccess(user.id, user.email);

  let { data: membership } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

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

    const role = user.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL ? "admin" : "member";
    await admin.from("company_users").upsert(
      { company_id: company.id, user_id: user.id, role },
      { onConflict: "company_id,user_id" },
    );
    membership = { company_id: company.id, role };
  }

  const isAdmin = membership.role === "admin";
  const allowedBranches = await loadAllowedBranches(
    supabase,
    user.id,
    membership.company_id,
    isAdmin,
  );

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(BRANCH_COOKIE)?.value;
  const branch = allowedBranches.find((item) => item.id === requestedId) ?? allowedBranches[0] ?? null;

  return {
    supabase,
    user,
    companyId: membership.company_id,
    role: membership.role,
    isAdmin,
    allowedBranches,
    branch,
  };
}

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

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.isAdmin) {
    redirect("/home");
  }
  return ctx;
}

export async function isAdminEditUnlocked() {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_EDIT_COOKIE)?.value === "1";
}
