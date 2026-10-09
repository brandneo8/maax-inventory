"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD = 8;

/** Sets the signed-in person's new password (after following a reset link). */
export async function updateOwnPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) {
    redirect(`/auth/reset?error=${encodeURIComponent(`Use at least ${MIN_PASSWORD} characters.`)}`);
  }
  if (password !== confirm) {
    redirect(`/auth/reset?error=${encodeURIComponent("The two passwords don't match.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login/forgot?error=${encodeURIComponent("Your reset link has expired. Request a new one to choose a password.")}`,
    );
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/reset?error=${encodeURIComponent(error.message)}`);

  redirect("/home");
}
