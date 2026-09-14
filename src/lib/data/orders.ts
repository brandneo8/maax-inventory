import type { createClient } from "@/lib/supabase/server";
import type { PoStatus } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getPurchaseOrders(supabase: Client, companyId: string, branchId?: string) {
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, expected_delivery_date, notes, branches(name), suppliers(supplier_name, gst_registered), purchase_order_items(quantity_ordered, unit_price), goods_receipts(invoice_reference, invoice_attachment_url, voided_at)",
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

const PENDING_PO_STATUSES = ["draft", "sent", "partially_received"] as const;

export type PendingBranchProductRequest = {
  productId: string;
  branchId: string;
  poNumber: string;
  status: string;
};

/**
 * Products on not-yet-fully-received purchase orders, grouped by the branch that ordered
 * them — used by /admin/branches to flag SKUs a branch is asking for before they've been
 * tagged into that branch's assignment (assignment only happens automatically on receipt).
 */
export async function getPendingBranchProductRequests(supabase: Client, companyId: string) {
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("product_id, purchase_orders!inner(company_id, branch_id, po_number, status)")
    .eq("purchase_orders.company_id", companyId)
    .in("purchase_orders.status", [...PENDING_PO_STATUSES]);

  if (error) throw error;

  const requests: PendingBranchProductRequest[] = (data ?? []).map((row) => ({
    productId: row.product_id,
    branchId: row.purchase_orders.branch_id,
    poNumber: row.purchase_orders.po_number,
    status: row.purchase_orders.status,
  }));
  return requests;
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
      "id, po_number, status, order_date, expected_delivery_date, notes, created_by, branch_id, supplier_id, branches(name), suppliers(supplier_name, gst_registered)",
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
      "id, product_id, classification, quantity_ordered, quantity_received, unit_price, line_total, sort_order, products(sku, name, order_name, size_label)",
    )
    .eq("purchase_order_id", id)
    .order("sort_order")
    .order("id");

  if (itemsError) throw itemsError;

  const { data: receipts, error: receiptsError } = await supabase
    .from("goods_receipts")
    .select(
      "id, received_date, received_by, notes, invoice_reference, invoice_attachment_url, rounding_adjustment, goods_receipt_items(product_id, quantity_received, classification, purchase_order_item_id, products(sku, name, order_name))",
    )
    .eq("purchase_order_id", id)
    .is("voided_at", null)
    .order("received_date");

  if (receiptsError) throw receiptsError;

  const { data: auditEvents, error: auditEventsError } = await supabase
    .from("purchase_order_audit_events")
    .select("id, event_type, actor_name, remarks, created_at")
    .eq("purchase_order_id", id)
    .order("created_at");

  if (auditEventsError) throw auditEventsError;

  return { ...data, items: items ?? [], receipts: receipts ?? [], auditEvents: auditEvents ?? [] };
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

export function canMarkUnsent(status: PoStatus) {
  return status === "sent";
}

export function canVoid(status: PoStatus) {
  return status !== "draft" && status !== "cancelled";
}

export function canAddFreeGoods(status: PoStatus) {
  return status !== "draft" && status !== "cancelled";
}
