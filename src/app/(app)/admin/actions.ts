"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function saveBranchAccess(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();

  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId);

  if (branchError) throw branchError;

  const { data: members, error: memberError } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId);

  if (memberError) throw memberError;

  const admin = createAdminClient();

  for (const member of members ?? []) {
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
}

