"use server";

import { revalidatePath } from "next/cache";
import { requireAdminBranch } from "@/lib/auth";
import { singaporeToday } from "@/lib/format";
import { createPurchaseOrder, type OrderLineInput } from "../stock-in/actions";

/**
 * Saves the planning form as one draft per supplier (a draft order has a
 * single supplier). Returns each draft's number with its supplier. Drafts
 * are created one at a time; if one fails, the ones before it stay saved
 * and the error names them.
 */
export async function savePlanningOrders(input: {
  branchId: string;
  requestedBy: string;
  orderDate: string;
  groups: { supplierId: string; lines: OrderLineInput[] }[];
}) {
  if (!input.requestedBy.trim()) throw new Error("Enter who is requesting these products.");
  const groups = input.groups.filter((group) => group.lines.some((line) => line.quantity_ordered > 0));
  if (groups.length === 0) throw new Error("Add at least one product with a quantity.");
  if (groups.some((group) => !group.supplierId)) throw new Error("Choose a supplier for every product.");

  const saved: { poNumber: string; supplierId: string }[] = [];
  for (const group of groups) {
    try {
      const result = await createPurchaseOrder({
        planningOnly: true,
        requestedBy: input.requestedBy,
        branch_id: input.branchId,
        supplier_id: group.supplierId,
        order_date: input.orderDate,
        notes: "",
        lines: group.lines,
      });
      if (result) saved.push({ poNumber: result.poNumber, supplierId: group.supplierId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the order.";
      throw new Error(
        saved.length > 0 ? `${message} (Already saved: ${saved.map((row) => row.poNumber).join(", ")}.)` : message,
      );
    }
  }

  revalidatePath("/orders");
  return saved;
}

/** A planning draft (saved on /orders) at the current salon, or an error. */
async function getPlanningOrder(orderId: string) {
  const context = await requireAdminBranch();
  const { data: order, error } = await context.supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", orderId)
    .eq("company_id", context.companyId)
    .eq("branch_id", context.branch.id)
    .eq("planning_only", true)
    .single();
  if (error || !order) throw new Error("Draft order not found.");
  return { ...context, order };
}

/** Marks a planning draft as sent to its supplier on the given date, by the named person. */
export async function markPlanningOrderSent(orderId: string, sentDate: string, sentBy: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) throw new Error("Enter the date the order was sent.");
  if (sentDate > singaporeToday()) throw new Error("The send date can't be in the future.");
  const sender = sentBy.trim();
  if (!sender) throw new Error("Enter who sent the order.");

  const { supabase, companyId, user, order } = await getPlanningOrder(orderId);
  if (order.status !== "draft") throw new Error(`${order.po_number} has already been sent.`);

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent", sent_date: sentDate, sent_by: sender })
    .eq("id", order.id)
    .eq("status", "draft");
  if (error) throw new Error(error.message || "Could not mark this order sent.");

  const { error: auditError } = await supabase.from("purchase_order_audit_events").insert({
    company_id: companyId,
    purchase_order_id: order.id,
    event_type: "sent",
    actor_name: user.email ?? "Unknown",
    remarks: `Sent on ${sentDate} by ${sender}.`,
  });
  if (auditError) throw auditError;

  revalidatePath("/orders");
}

/** Moves a sent planning draft back to not sent, clearing its send date. */
export async function markPlanningOrderUnsent(orderId: string) {
  const { supabase, companyId, user, order } = await getPlanningOrder(orderId);
  if (order.status !== "sent") throw new Error(`${order.po_number} isn't marked sent.`);

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "draft", sent_date: null, sent_by: null })
    .eq("id", order.id)
    .eq("status", "sent");
  if (error) throw new Error(error.message || "Could not mark this order unsent.");

  const { error: auditError } = await supabase.from("purchase_order_audit_events").insert({
    company_id: companyId,
    purchase_order_id: order.id,
    event_type: "unsent",
    actor_name: user.email ?? "Unknown",
    remarks: "Marked not sent.",
  });
  if (auditError) throw auditError;

  revalidatePath("/orders");
}

/** Deletes a planning draft, sent or not — it never touched stock. */
export async function deletePlanningOrder(orderId: string) {
  const { supabase, order } = await getPlanningOrder(orderId);

  // Lines and audit events go with it (on delete cascade).
  const { error } = await supabase.from("purchase_orders").delete().eq("id", order.id).eq("planning_only", true);
  if (error) throw new Error(error.message || "Could not delete this order.");

  revalidatePath("/orders");
}
