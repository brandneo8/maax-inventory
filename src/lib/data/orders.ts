import type { createClient } from "@/lib/supabase/server";
import type { PoStatus } from "@/lib/labels";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * planningOnly picks the side: true for drafts saved on the /orders planning
 * page, false for everything Stock-in works with.
 */
export async function getPurchaseOrders(
  supabase: Client,
  companyId: string,
  branchId: string | undefined,
  planningOnly: boolean,
) {
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, sent_date, sent_by, requested_by, expected_delivery_date, notes, branches(name), suppliers(supplier_name, gst_registered), purchase_order_items(id, product_id, quantity_ordered, unit_price, sort_order, products(sku, name, order_name, size_label, brands(name))), goods_receipts(invoice_reference, invoice_attachment_url, voided_at)",
    )
    .eq("company_id", companyId)
    .eq("planning_only", planningOnly)
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
      "id, po_number, status, order_date, expected_delivery_date, notes, created_by, branch_id, supplier_id, fx_adjustment, branches(name), suppliers(supplier_name, gst_registered)",
    )
    .eq("company_id", companyId)
    .eq("id", id)
    // Planning drafts live on /orders only — Stock-in can't open them.
    .eq("planning_only", false);

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query.single();

  if (error) throw error;

  // items/receipts/auditEvents only depend on the order id above, not on
  // each other — fetch them together instead of one round trip at a time.
  const [itemsResult, receiptsResult, auditEventsResult] = await Promise.all([
    supabase
      .from("purchase_order_items")
      .select(
        "id, product_id, classification, quantity_ordered, quantity_received, unit_price, line_total, sort_order, products(sku, name, order_name, size_label)",
      )
      .eq("purchase_order_id", id)
      .order("sort_order")
      .order("id"),
    supabase
      .from("goods_receipts")
      .select(
        "id, received_date, received_by, notes, invoice_reference, invoice_attachment_url, rounding_adjustment, fx_adjustment, goods_receipt_items(product_id, quantity_received, classification, purchase_order_item_id, products(sku, name, order_name))",
      )
      .eq("purchase_order_id", id)
      .is("voided_at", null)
      .order("received_date"),
    supabase
      .from("purchase_order_audit_events")
      .select("id, event_type, actor_name, remarks, created_at")
      .eq("purchase_order_id", id)
      .order("created_at"),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (receiptsResult.error) throw receiptsResult.error;
  if (auditEventsResult.error) throw auditEventsResult.error;

  return {
    ...data,
    items: itemsResult.data ?? [],
    receipts: receiptsResult.data ?? [],
    auditEvents: auditEventsResult.data ?? [],
  };
}

/**
 * One running sequence across years (PO-<year>-<n>), continuing from the
 * highest number issued — not the order count, which drops when a draft is
 * deleted and would hand out a number that's already taken.
 */
export async function nextPoNumber(supabase: Client, companyId: string) {
  const highest = await highestOrderSequence(supabase, companyId, false);
  const year = new Date().getFullYear();
  return `PO-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/** Planning drafts saved on /orders run their own sequence: DRAFT-0001, DRAFT-0002, … */
export async function nextDraftNumber(supabase: Client, companyId: string) {
  const highest = await highestOrderSequence(supabase, companyId, true);
  return `DRAFT-${String(highest + 1).padStart(4, "0")}`;
}

async function highestOrderSequence(supabase: Client, companyId: string, planningOnly: boolean) {
  let highest = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("company_id", companyId)
      .eq("planning_only", planningOnly)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      const sequence = Number(/(\d+)$/.exec(row.po_number ?? "")?.[1] ?? 0);
      if (sequence > highest) highest = sequence;
    }
    if (!data || data.length < 1000) break;
  }
  return highest;
}

export function canReceive(status: PoStatus) {
  return status === "draft" || status === "sent" || status === "confirmed" || status === "partially_received";
}

export function canVoid(status: PoStatus) {
  return status !== "draft" && status !== "cancelled";
}

export function canAddFreeGoods(status: PoStatus) {
  return status !== "draft" && status !== "cancelled";
}
