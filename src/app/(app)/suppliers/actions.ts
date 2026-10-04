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
  /** Still ordered from; inactive suppliers are kept but marked. */
  is_active: boolean;
};

function supplierPayload(draft: SupplierDraft) {
  return {
    supplier_name: draft.supplier_name.trim(),
    poc_name: draft.poc_name.trim() || null,
    poc_number: draft.poc_number.trim() || null,
    order_channel: draft.order_channel || null,
    gst_registered: draft.gst_registered,
    is_active: draft.is_active,
  };
}

function sameSupplier(
  current: {
    supplier_name: string;
    poc_name: string | null;
    poc_number: string | null;
    order_channel: string | null;
    gst_registered: boolean;
    is_active: boolean;
  },
  next: ReturnType<typeof supplierPayload>,
) {
  return (
    current.supplier_name === next.supplier_name &&
    (current.poc_name ?? null) === next.poc_name &&
    (current.poc_number ?? null) === next.poc_number &&
    (current.order_channel ?? null) === next.order_channel &&
    current.gst_registered === next.gst_registered &&
    current.is_active === next.is_active
  );
}

function revalidateSuppliers() {
  revalidatePath("/admin");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/products");
  revalidatePath("/stock-in/new");
}

export async function saveSuppliers(drafts: SupplierDraft[]) {
  const { supabase, companyId } = await requireAdmin();
  const rows = drafts.filter((draft) => draft.supplier_name.trim());
  const { data: existing, error: existingError } = await supabase
    .from("suppliers")
    .select("id, supplier_name, poc_name, poc_number, order_channel, gst_registered, is_active")
    .eq("company_id", companyId);
  if (existingError) throw existingError;
  const byId = new Map((existing ?? []).map((row) => [row.id, row]));

  for (const draft of rows) {
    const payload = supplierPayload(draft);

    if (draft.id) {
      const current = byId.get(draft.id);
      if (current && sameSupplier(current, payload)) continue;
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

  revalidateSuppliers();
}

export async function deleteSupplier(id: string) {
  const { supabase, companyId } = await requireAdmin();
  const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw error;
  revalidateSuppliers();
}
