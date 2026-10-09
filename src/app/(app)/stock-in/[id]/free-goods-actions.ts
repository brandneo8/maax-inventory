"use server";

import { requireBranch } from "@/lib/auth";
import { getOrderProductOptions } from "@/lib/data/products";

/**
 * The company catalog (with this salon's avg costs) for the "Add free goods"
 * picker. Loaded when the modal first opens rather than with the order page,
 * since most visits to a received order never add free goods.
 */
export async function getFreeGoodsProductOptionsAction() {
  const { supabase, companyId, branch } = await requireBranch();
  return getOrderProductOptions(supabase, companyId, branch.id);
}
