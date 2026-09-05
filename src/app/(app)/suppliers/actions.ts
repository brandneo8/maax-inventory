"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { OrderChannel } from "@/lib/labels";

export type SupplierDraft = {
  id?: string;
  supplier_name: string;
  poc_name: string;
  poc_number: string;
  order_channel: OrderChannel | "";
  gst_registered: boolean;
};

export async function saveSuppliers(drafts: SupplierDraft[]) {
  const { supabase, companyId } = await requireAdmin();
  const rows = drafts.filter((draft) => draft.supplier_name.trim());

  for (const draft of rows) {
    const payload = {
      supplier_name: draft.supplier_name.trim(),
      poc_name: draft.poc_name.trim() || null,
      poc_number: draft.poc_number.trim() || null,
      order_channel: draft.order_channel || null,
      gst_registered: draft.gst_registered,
    };

    if (draft.id) {
      const { error } = await supabase
        .from("suppliers")
        .update(payload)
        .eq("id", draft.id)
        .eq("company_id", companyId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("suppliers").insert({
        ...payload,
        company_id: companyId,
      });
      if (error) throw error;
    }
  }

  revalidatePath("/admin");
  revalidatePath("/orders/new");
}

export async function deleteSupplier(id: string) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/orders/new");
}
