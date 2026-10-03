"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { nextDraftNumber, nextPoNumber } from "@/lib/data/orders";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import {
  applyLateReceiptTrueUps,
  applyRemovedReceiptTrueUps,
  removeLateReceiptTrueUps,
} from "@/lib/data/receipt-trueups";
import { businessTxnDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductClassification } from "@/lib/labels";

function revalidatePurchaseOrderPaths(orderId?: string) {
  revalidatePath("/stock-in");
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/stock-in/${orderId}`);
}

const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
const INVOICE_MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function uploadInvoiceAttachment(companyId: string, goodsReceiptId: string, file: File) {
  const extension = INVOICE_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("Invoice attachment must be a PDF, PNG, JPEG, or WEBP.");
  }
  if (file.size > MAX_INVOICE_BYTES) {
    throw new Error("Invoice attachment must be smaller than 10 MB.");
  }
  const admin = createAdminClient();
  const path = `${companyId}/${goodsReceiptId}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("invoice-attachments")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message || "Could not upload the invoice.");
  const { data: publicUrlData } = admin.storage.from("invoice-attachments").getPublicUrl(path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

export type OrderLineInput = {
  product_id: string;
  classification: ProductClassification;
  quantity_ordered: number;
  unit_price: number;
};

export async function createPurchaseOrder(input: {
  branch_id: string;
  supplier_id: string;
  order_date: string;
  notes: string;
  lines: OrderLineInput[];
  /**
   * Saved from the /orders planning page: the draft stays there (kept out of
   * Stock-in, so it can't be sent or received) and we don't navigate away.
   */
  planningOnly?: boolean;
  /** Planning drafts: who's asking for these products. */
  requestedBy?: string;
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  const lines = input.lines.filter((line) => line.product_id && line.quantity_ordered > 0);

  if (lines.length === 0) {
    throw new Error("Add at least one order line.");
  }

  if (input.planningOnly && !input.requestedBy?.trim()) {
    throw new Error("Enter who is requesting these products.");
  }
  const poNumber = input.planningOnly
    ? await nextDraftNumber(supabase, companyId)
    : await nextPoNumber(supabase, companyId);
  const { data: order, error } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      supplier_id: input.supplier_id,
      po_number: poNumber,
      status: "draft",
      order_date: input.order_date || null,
      notes: input.notes || null,
      created_by: user.email,
      planning_only: Boolean(input.planningOnly),
      requested_by: input.requestedBy?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !order) throw error ?? new Error("Could not create purchase order.");

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    lines.map((line, index) => ({
      purchase_order_id: order.id,
      product_id: line.product_id,
      classification: line.classification,
      quantity_ordered: line.quantity_ordered,
      unit_price: line.unit_price,
      sort_order: index,
    })),
  );

  if (itemsError) throw itemsError;

  revalidatePurchaseOrderPaths(order.id);
  revalidatePath("/");
  if (input.planningOnly) return { poNumber };
  redirect(`/stock-in/${order.id}`);
}

export async function updatePurchaseOrder(input: {
  purchase_order_id: string;
  supplier_id: string;
  order_date: string;
  /** FX clearing amount planned on the draft; pre-fills the receipt's amount when it's received. */
  fx_adjustment?: number;
  lines: OrderLineInput[];
}) {
  const { supabase, companyId, branch } = await requireBranch();
  const lines = input.lines.filter((line) => line.product_id && line.quantity_ordered > 0);

  if (lines.length === 0) {
    throw new Error("Add at least one order line.");
  }
  if (!input.supplier_id) {
    throw new Error("Select a supplier.");
  }

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", input.purchase_order_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");
  if (order.status !== "draft") {
    throw new Error("This order has already been sent and can no longer be edited.");
  }

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: input.supplier_id,
      order_date: input.order_date || null,
      fx_adjustment: Number.isFinite(input.fx_adjustment) ? Number(input.fx_adjustment) : 0,
    })
    .eq("id", order.id);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", order.id);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("purchase_order_items").insert(
    lines.map((line, index) => ({
      purchase_order_id: order.id,
      product_id: line.product_id,
      classification: line.classification,
      quantity_ordered: line.quantity_ordered,
      unit_price: line.unit_price,
      sort_order: index,
    })),
  );
  if (insertError) throw insertError;

  revalidatePurchaseOrderPaths(order.id);
}

export async function receivePurchaseOrder(
  input: {
    purchase_order_id: string;
    received_date: string;
    notes: string;
    invoice_reference: string;
    rounding_adjustment: number;
    /** Currency exchange clearing amount to match the PDF invoice — stored on the receipt, not the ledger. */
    fx_adjustment: number;
    lines: {
      purchase_order_item_id: string | null;
      product_id: string;
      store_location_id: string;
      quantity_received: number;
      unit_cost: number;
      classification: ProductClassification | null;
    }[];
  },
  invoiceFile?: File | null,
) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");
  const lines = input.lines.filter((line) => line.quantity_received > 0 && line.store_location_id);

  if (lines.length === 0) {
    throw new Error("Enter a received quantity for at least one line.");
  }
  for (const line of lines) {
    if (!line.purchase_order_item_id && !line.classification) {
      throw new Error("Select a type for each free/GWP item.");
    }
  }

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, branch_id, status")
    .eq("id", input.purchase_order_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("planning_only", false)
    .single();

  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");
  if (order.status === "cancelled") {
    throw new Error("This order is voided, so stock can't be received into it. Duplicate it into a new order instead.");
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .insert({
      company_id: companyId,
      purchase_order_id: order.id,
      branch_id: order.branch_id,
      received_date: input.received_date || new Date().toISOString().slice(0, 10),
      received_by: user.email,
      notes: input.notes || null,
      rounding_adjustment: Number.isFinite(input.rounding_adjustment) ? input.rounding_adjustment : 0,
      fx_adjustment: Number.isFinite(input.fx_adjustment) ? input.fx_adjustment : 0,
    })
    .select("id")
    .single();

  if (receiptError || !receipt) throw receiptError ?? new Error("Could not create goods receipt.");

  const { error: itemsError } = await supabase.from("goods_receipt_items").insert(
    lines.map((line) => ({
      goods_receipt_id: receipt.id,
      purchase_order_item_id: line.purchase_order_item_id,
      product_id: line.product_id,
      store_location_id: line.store_location_id,
      quantity_received: line.quantity_received,
      unit_cost: line.purchase_order_item_id ? line.unit_cost : 0,
      classification: line.purchase_order_item_id ? null : line.classification,
    })),
  );

  if (itemsError) throw itemsError;

  await applyLateReceiptTrueUps(supabase, {
    companyId,
    branchId: order.branch_id,
    receiptId: receipt.id,
    createdBy: user.email,
  });

  const receiptPatch: { invoice_reference: string | null; invoice_attachment_url?: string } = {
    invoice_reference: input.invoice_reference.trim() || null,
  };
  if (invoiceFile && invoiceFile.size > 0) {
    receiptPatch.invoice_attachment_url = await uploadInvoiceAttachment(companyId, receipt.id, invoiceFile);
  }
  if (receiptPatch.invoice_reference || receiptPatch.invoice_attachment_url) {
    const { error: receiptPatchError } = await supabase
      .from("goods_receipts")
      .update(receiptPatch)
      .eq("id", receipt.id);
    if (receiptPatchError) throw receiptPatchError;
  }

  const productIds = [...new Set(lines.map((line) => line.product_id))];
  const { data: assigned, error: assignedError } = await supabase
    .from("product_branches")
    .select("product_id")
    .eq("branch_id", order.branch_id)
    .in("product_id", productIds);
  if (assignedError) throw assignedError;
  const alreadyAssigned = new Set((assigned ?? []).map((row) => row.product_id));
  const newlyAssigned = productIds.filter((id) => !alreadyAssigned.has(id));
  if (newlyAssigned.length > 0) {
    const { error: assignError } = await supabase
      .from("product_branches")
      .insert(newlyAssigned.map((productId) => ({ product_id: productId, branch_id: order.branch_id })));
    if (assignError) throw assignError;
  }

  revalidatePurchaseOrderPaths(order.id);
  revalidatePath("/home");
  redirect(`/stock-in/${order.id}`);
}

export async function addFreeGoodsReceipt(input: {
  purchase_order_id: string;
  received_date: string;
  notes: string;
  lines: { product_id: string; quantity_received: number; classification: ProductClassification }[];
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");
  const lines = input.lines.filter((line) => line.quantity_received > 0 && line.product_id);

  if (lines.length === 0) {
    throw new Error("Add at least one free product.");
  }

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, branch_id, status")
    .eq("id", input.purchase_order_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("planning_only", false)
    .single();
  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");
  if (order.status === "draft" || order.status === "cancelled") {
    throw new Error("This order can't take free goods — send it first, or duplicate it if it's voided.");
  }

  const storeLocationId = await getDefaultStoreLocationId(supabase, order.branch_id);

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .insert({
      company_id: companyId,
      purchase_order_id: order.id,
      branch_id: order.branch_id,
      received_date: input.received_date || new Date().toISOString().slice(0, 10),
      received_by: user.email,
      notes: input.notes || null,
    })
    .select("id")
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Could not create the receipt.");

  const { error: itemsError } = await supabase.from("goods_receipt_items").insert(
    lines.map((line) => ({
      goods_receipt_id: receipt.id,
      purchase_order_item_id: null,
      product_id: line.product_id,
      store_location_id: storeLocationId,
      quantity_received: line.quantity_received,
      unit_cost: 0,
      classification: line.classification,
    })),
  );
  if (itemsError) throw itemsError;

  await applyLateReceiptTrueUps(supabase, {
    companyId,
    branchId: order.branch_id,
    receiptId: receipt.id,
    createdBy: user.email,
  });

  const productIds = [...new Set(lines.map((line) => line.product_id))];
  const { data: assigned, error: assignedError } = await supabase
    .from("product_branches")
    .select("product_id")
    .eq("branch_id", order.branch_id)
    .in("product_id", productIds);
  if (assignedError) throw assignedError;
  const alreadyAssigned = new Set((assigned ?? []).map((row) => row.product_id));
  const newlyAssigned = productIds.filter((id) => !alreadyAssigned.has(id));
  if (newlyAssigned.length > 0) {
    const { error: assignError } = await supabase
      .from("product_branches")
      .insert(newlyAssigned.map((productId) => ({ product_id: productId, branch_id: order.branch_id })));
    if (assignError) throw assignError;
  }

  revalidatePurchaseOrderPaths(order.id);
  revalidatePath("/home");
}

export async function voidPurchaseOrder(formData: FormData) {
  const { supabase, companyId, branch, user } = await requireBranch();
  const id = String(formData.get("id") ?? "");

  // Voiding reverses every live receipt on the order, so their count
  // true-ups go first (as in removeGoodsReceipt) and come back on failure.
  const { data: receipts, error: receiptsError } = await supabase
    .from("goods_receipts")
    .select("id")
    .eq("purchase_order_id", id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .is("voided_at", null);
  if (receiptsError) throw receiptsError;
  const trueUpScopes = (receipts ?? []).map((receipt) => ({ companyId, branchId: branch.id, receiptId: receipt.id }));
  // Lift each receipt's late-receipt true-ups, then give back what any
  // count that already included a receipt took off for it (so its counted
  // balance holds once the receipt is reversed).
  for (const scope of trueUpScopes) {
    await removeLateReceiptTrueUps(supabase, scope);
    await applyRemovedReceiptTrueUps(supabase, { ...scope, createdBy: user.email }, "removed");
  }

  const { error } = await supabase.rpc("fn_void_purchase_order", {
    p_purchase_order_id: id,
    p_company_id: companyId,
    p_branch_id: branch.id,
  });

  if (error) {
    for (const scope of trueUpScopes) {
      await removeLateReceiptTrueUps(supabase, scope);
      await applyLateReceiptTrueUps(supabase, { ...scope, createdBy: user.email });
    }
    throw new Error(error.message || "Could not void this order.");
  }
  revalidatePurchaseOrderPaths(id);
  revalidatePath("/");
  redirect(`/stock-in/${id}`);
}

/**
 * Changes only the order date of a sent/received order — it's for reference
 * only (stock and cost go by each receipt's received date), so it stays
 * editable after receiving. Drafts change it through updatePurchaseOrder.
 */
export async function updatePurchaseOrderDate(purchaseOrderId: string, orderDate: string) {
  const { supabase, companyId, branch, user } = await requireBranch();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new Error("Enter a valid order date.");

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, order_date")
    .eq("id", purchaseOrderId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");
  if (order.order_date === orderDate) return;

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({ order_date: orderDate })
    .eq("id", order.id);
  if (updateError) throw updateError;

  const { error: auditError } = await supabase.from("purchase_order_audit_events").insert({
    company_id: companyId,
    purchase_order_id: order.id,
    event_type: "order_date_changed",
    actor_name: user.email ?? "Unknown",
    remarks: `Order date changed from ${order.order_date ?? "none"} to ${orderDate}.`,
  });
  if (auditError) throw auditError;

  revalidatePurchaseOrderPaths(order.id);
}

/** Deletes a draft order outright — nothing has been received or sent on it yet. */
export async function deleteDraftPurchaseOrder(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const id = String(formData.get("id") ?? "");

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");
  if (order.status !== "draft") throw new Error("Only draft orders can be deleted. Void this order instead.");

  const { count: receiptCount, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", order.id);
  if (receiptError) throw receiptError;
  if ((receiptCount ?? 0) > 0) throw new Error("This order has stock received on it, so it can't be deleted.");

  // Lines and audit events go with it (on delete cascade).
  const { error: deleteError } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", order.id)
    .eq("status", "draft");
  if (deleteError) throw new Error(deleteError.message || "Could not delete this draft.");

  revalidatePurchaseOrderPaths();
  revalidatePath("/");
  redirect("/stock-in");
}

export async function duplicatePurchaseOrder(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const id = String(formData.get("id") ?? "");

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, supplier_id, branch_id, order_date, notes")
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");

  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select("product_id, classification, quantity_ordered, unit_price, sort_order")
    .eq("purchase_order_id", order.id)
    .order("sort_order");
  if (itemsError) throw itemsError;
  if (!items || items.length === 0) throw new Error("This order has no lines to copy.");

  const poNumber = await nextPoNumber(supabase, companyId);
  const { data: newOrder, error: createError } = await supabase
    .from("purchase_orders")
    .insert({
      company_id: companyId,
      branch_id: order.branch_id,
      supplier_id: order.supplier_id,
      po_number: poNumber,
      status: "draft",
      order_date: new Date().toISOString().slice(0, 10),
      notes: order.notes,
      created_by: user.email,
    })
    .select("id")
    .single();
  if (createError || !newOrder) throw createError ?? new Error("Could not duplicate purchase order.");

  const { error: newItemsError } = await supabase.from("purchase_order_items").insert(
    items.map((item, index) => ({
      purchase_order_id: newOrder.id,
      product_id: item.product_id,
      classification: item.classification,
      quantity_ordered: item.quantity_ordered,
      unit_price: item.unit_price,
      sort_order: index,
    })),
  );
  if (newItemsError) throw newItemsError;

  revalidatePurchaseOrderPaths(newOrder.id);
  revalidatePath("/");
  redirect(`/stock-in/${newOrder.id}`);
}

/**
 * Moves a receipt's stock to its new received date in the ledger, then
 * replays cost from there and re-runs the count true-ups — the new date may
 * fall before (or no longer before) a confirmed count.
 */
async function redateReceiptLedger(
  supabase: Awaited<ReturnType<typeof requireBranch>>["supabase"],
  input: { companyId: string; branchId: string; receiptId: string; receivedDate: string; createdBy: string | undefined },
) {
  const scope = { companyId: input.companyId, branchId: input.branchId, receiptId: input.receiptId };
  await removeLateReceiptTrueUps(supabase, scope);

  const { data: items, error: itemsError } = await supabase
    .from("goods_receipt_items")
    .select("id")
    .eq("goods_receipt_id", input.receiptId);
  if (itemsError) throw itemsError;
  const itemIds = (items ?? []).map((item) => item.id);
  if (itemIds.length > 0) {
    const { data: moved, error: moveError } = await supabase
      .from("inventory_transactions")
      .update({ txn_date: businessTxnDate(input.receivedDate) })
      .eq("reference_table", "goods_receipt_items")
      .eq("txn_type", "goods_receipt")
      .gt("quantity_change", 0)
      .in("reference_id", itemIds)
      .select("product_id");
    if (moveError) throw moveError;
    for (const productId of new Set((moved ?? []).map((row) => row.product_id))) {
      const { error: recomputeError } = await supabase.rpc("fn_recompute_branch_cost", {
        p_company_id: input.companyId,
        p_product_id: productId,
        p_branch_id: input.branchId,
      });
      if (recomputeError) throw new Error(recomputeError.message || "Could not update product costs.");
    }
  }

  await applyLateReceiptTrueUps(supabase, { ...scope, createdBy: input.createdBy });
}

export async function removeGoodsReceipt(goodsReceiptId: string) {
  const { supabase, companyId, branch, user } = await requireBranch();

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id, purchase_order_id, voided_at")
    .eq("id", goodsReceiptId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");
  if (receipt.voided_at) throw new Error("This receipt has already been removed.");

  // Count true-ups this receipt caused go first, so the reversal checks the
  // balance the receipt itself added. Then, for a count that had already
  // included this receipt, give back what its shortfall took off for it —
  // the count's numbers stay as counted. Undo both if the reversal refuses.
  const trueUpScope = { companyId, branchId: branch.id, receiptId: receipt.id };
  await removeLateReceiptTrueUps(supabase, trueUpScope);
  await applyRemovedReceiptTrueUps(supabase, { ...trueUpScope, createdBy: user.email }, "removed");
  const { error } = await supabase.rpc("fn_reverse_goods_receipt", { p_goods_receipt_id: receipt.id });
  if (error) {
    await removeLateReceiptTrueUps(supabase, trueUpScope);
    await applyLateReceiptTrueUps(supabase, { ...trueUpScope, createdBy: user.email });
    throw new Error(error.message || "Could not remove this receipt.");
  }

  revalidatePurchaseOrderPaths(receipt.purchase_order_id ?? undefined);
}

export async function updateGoodsReceiptInvoice(
  goodsReceiptId: string,
  invoiceReference: string,
  receivedDate: string,
  roundingAdjustment: number,
  fxAdjustment: number,
  invoiceFile?: File | null,
) {
  const { supabase, companyId, branch, user } = await requireBranch();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
    throw new Error("Enter a valid received date.");
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id, purchase_order_id, received_date, voided_at")
    .eq("id", goodsReceiptId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");

  const patch: {
    invoice_reference: string | null;
    received_date: string;
    rounding_adjustment: number;
    fx_adjustment: number;
    invoice_attachment_url?: string;
  } = {
    invoice_reference: invoiceReference.trim() || null,
    received_date: receivedDate,
    rounding_adjustment: Number.isFinite(roundingAdjustment) ? roundingAdjustment : 0,
    fx_adjustment: Number.isFinite(fxAdjustment) ? fxAdjustment : 0,
  };
  if (invoiceFile && invoiceFile.size > 0) {
    patch.invoice_attachment_url = await uploadInvoiceAttachment(companyId, receipt.id, invoiceFile);
  }

  const { error: updateError } = await supabase.from("goods_receipts").update(patch).eq("id", receipt.id);
  if (updateError) throw updateError;

  if (!receipt.voided_at && receipt.received_date !== receivedDate) {
    await redateReceiptLedger(supabase, {
      companyId,
      branchId: branch.id,
      receiptId: receipt.id,
      receivedDate,
      createdBy: user.email,
    });
  } else if (!receipt.voided_at) {
    // Same date: still re-run the count true-ups, so saving a receipt always
    // leaves them matching the current rules and counts.
    const scope = { companyId, branchId: branch.id, receiptId: receipt.id };
    await removeLateReceiptTrueUps(supabase, scope);
    await applyLateReceiptTrueUps(supabase, { ...scope, createdBy: user.email });
  }

  if (receipt.purchase_order_id && receipt.received_date !== receivedDate) {
    const { error: auditError } = await supabase.from("purchase_order_audit_events").insert({
      company_id: companyId,
      purchase_order_id: receipt.purchase_order_id,
      event_type: "receipt_date_changed",
      actor_name: user.email ?? "Unknown",
      remarks: `Received date changed from ${receipt.received_date} to ${receivedDate}.`,
    });
    if (auditError) throw auditError;
  }

  revalidatePurchaseOrderPaths(receipt.purchase_order_id ?? undefined);
}
