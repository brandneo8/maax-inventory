"use server";

import { requireBranch } from "@/lib/auth";
import { getBranchProductBalances } from "@/lib/data/products";
import { getProductLedger } from "@/lib/data/stock";

/** The current salon's products and on-hand balances, for the right-hand Products panel. */
export async function getProductBalancesAction() {
  const { supabase, companyId, branch } = await requireBranch();
  return getBranchProductBalances(supabase, companyId, branch.id);
}

/** One product's full ledger at the current salon, for the panel's popup. */
export async function getProductLedgerAction(productId: string) {
  const { supabase, companyId, branch } = await requireBranch();
  return getProductLedger(supabase, companyId, branch.id, productId);
}
