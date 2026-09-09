"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_EDIT_COOKIE, isAdminEditUnlocked, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function unlockAdminEdit(formData: FormData) {
  await requireAdmin();
  const expected = process.env.ADMIN_EDIT_PASSWORD?.trim() ?? "";
  const password = String(formData.get("password") ?? "");

  if (!expected || password !== expected) {
    redirect("/admin/users?error=" + encodeURIComponent("That password did not unlock editing."));
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_EDIT_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function saveBranchAccess(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  if (!(await isAdminEditUnlocked())) {
    throw new Error("Unlock Admin editing first.");
  }

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

export async function saveStoreLocations(formData: FormData) {
  const { supabase, companyId } = await requireAdmin();
  const { data: branches, error: branchError } = await supabase
    .from("branches")
    .select("id, name")
    .eq("company_id", companyId);
  if (branchError) throw branchError;

  for (const branch of branches ?? []) {
    const count = Number(formData.get(`count:${branch.id}`) ?? 0);
    const keptIds: string[] = [];
    const seenNames = new Set<string>();

    for (let index = 0; index < count; index += 1) {
      const id = String(formData.get(`id:${branch.id}:${index}`) ?? "").trim();
      const name = String(formData.get(`name:${branch.id}:${index}`) ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        throw new Error(`“${name}” is listed twice for ${branch.name}.`);
      }
      seenNames.add(key);

      if (id) {
        const { error } = await supabase
          .from("store_locations")
          .update({ name, sort_order: index + 1 })
          .eq("id", id)
          .eq("branch_id", branch.id);
        if (error) throw error;
        keptIds.push(id);
      } else {
        const { data, error } = await supabase
          .from("store_locations")
          .insert({ branch_id: branch.id, name, sort_order: index + 1 })
          .select("id")
          .single();
        if (error) throw error;
        if (data) keptIds.push(data.id);
      }
    }

    if (keptIds.length === 0) {
      throw new Error(`${branch.name} needs at least one count location.`);
    }

    const { data: existing, error: existingError } = await supabase
      .from("store_locations")
      .select("id, name")
      .eq("branch_id", branch.id);
    if (existingError) throw existingError;

    const kept = new Set(keptIds);
    for (const location of existing ?? []) {
      if (kept.has(location.id)) continue;
      const { error } = await supabase.from("store_locations").delete().eq("id", location.id).eq("branch_id", branch.id);
      if (error) {
        throw new Error(
          `Could not remove “${location.name}” from ${branch.name}. It is already used in stock, counts, or receipts.`,
        );
      }
    }
  }

  revalidatePath("/admin/locations");
  revalidatePath("/counts");
  revalidatePath("/counts/new");
}
