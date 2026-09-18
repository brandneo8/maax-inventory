"use server";

import { requireBranch } from "@/lib/auth";
import { getProductLedger } from "@/lib/data/stock";

export async function getProductLedgerAction(productId: string) {
  const { supabase, companyId, branch } = await requireBranch();
  return getProductLedger(supabase, companyId, branch.id, productId);
}
