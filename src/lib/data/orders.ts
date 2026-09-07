import type { createClient } from "@/lib/supabase/server";
import type { PoStatus } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getPurchaseOrders(supabase: Client, companyId: string, branchId?: string) {
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, expected_delivery_date, notes, branches(name), suppliers(supplier_name)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getPurchaseOrder(
  supabase: Client,
  companyId: string,
  id: string,
  branchId?: string,
) {
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, expected_delivery_date, notes, created_by, branch_id, supplier_id, branches(name), suppliers(supplier_name)",
    )
    .eq("company_id", companyId)
    .eq("id", id);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query.single();

  if (error) throw error;

  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select(
      "id, product_id, classification, quantity_ordered, quantity_received, unit_price, line_total, products(sku, name, order_name)",
    )
    .eq("purchase_order_id", id)
    .order("id");

  if (itemsError) throw itemsError;

  return { ...data, items: items ?? [] };
}

export async function nextPoNumber(supabase: Client, companyId: string) {
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (error) throw error;
  const year = new Date().getFullYear();
  return `PO-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export function canReceive(status: PoStatus) {
  return status === "sent" || status === "confirmed" || status === "partially_received";
}

export function canMarkSent(status: PoStatus) {
  return status === "draft";
}
