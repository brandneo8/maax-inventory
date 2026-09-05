"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { BRANCH_COOKIE, requireUser } from "@/lib/auth";

export async function selectBranch(branchId: string) {
  const { allowedBranches } = await requireUser();
  if (!allowedBranches.some((branch) => branch.id === branchId)) {
    throw new Error("You do not have access to that branch.");
  }

  const cookieStore = await cookies();
  cookieStore.set(BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  revalidatePath("/", "layout");
}
