"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { nextDraftNumber, nextPoNumber } from "@/lib/data/orders";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import {
  applyLateReceiptTrueUps,
  applyRemovedReceiptTrueUps,
  assertReceiptTrueUpsRemovable,
  removeLateReceiptTrueUps,
  restoreReceiptTrueUps,
} from "@/lib/data/receipt-trueups";
import { businessTxnDate, formatDate, singaporeToday } from "@/lib/format";
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

/**
 * What the receiving actions return. Errors come back as values rather than
 * being thrown: Next.js hides thrown server-action messages in production,
 * so the person saving would only see a generic error. `warning` means it
 * saved, but a follow-up step (count true-ups, the invoice upload) didn't.
 */
export type StockInResult<T = object> =
  ({ ok: true; warning?: string } & T) | { ok: false; error: string };

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string" &&
    err.message
  ) {
    return err.message;
  }
  return fallback;
}

/**
 * Sends SQL null for an empty argument (the generated RPC types mark every
 * argument as required; leaving the key out would make the call fail).
 */
function nullable<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}

/** Checks an invoice file before anything is saved. */
function checkInvoiceFile(file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  const extension = INVOICE_MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("The invoice attachment must be a PDF, PNG, JPEG or WEBP file.");
  if (file.size > MAX_INVOICE_BYTES)
    throw new Error("The invoice attachment must be smaller than 10 MB.");
  return { file, extension };
}

async function uploadInvoiceAttachment(
  companyId: string,
  goodsReceiptId: string,
  invoice: { file: File; extension: string },
) {
  const admin = createAdminClient();
  const path = `${companyId}/${goodsReceiptId}.${invoice.extension}`;
  const { error: uploadError } = await admin.storage
    .from("invoice-attachments")
    .upload(path, invoice.file, { upsert: true, contentType: invoice.file.type });
  if (uploadError) throw new Error(uploadError.message || "Could not upload the invoice.");
  const { data: publicUrlData } = admin.storage.from("invoice-attachments").getPublicUrl(path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

/** A received date: a real date, not after today in Singapore. */
function checkReceivedDate(value: string) {
  const date = value || singaporeToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid received date.");
  if (date > singaporeToday()) {
    throw new Error(
      `The received date can't be in the future (today is ${formatDate(singaporeToday())}).`,
    );
  }
  return date;
}

/** Count true-ups after a receipt is booked; a failure is reported but doesn't undo the receipt. */
async function trueUpNewReceipt(
  supabase: Awaited<ReturnType<typeof requireBranch>>["supabase"],
  scope: { companyId: string; branchId: string; receiptId: string; createdBy: string | undefined },
) {
  try {
    await applyLateReceiptTrueUps(supabase, scope);
    return undefined;
  } catch (err) {
    return `Received, but the count corrections for this receipt couldn't be applied (${errorMessage(err, "unknown error")}). Open the receipt, click Edit receipt and Save to retry.`;
  }
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

/** A product line on the stock-in form: what arrived and its price. */
export type StockInLineInput = {
  product_id: string;
  classification: ProductClassification;
  quantity: number;
  unit_price: number;
};

/** A product that arrived at no charge (tester, GWP). */
export type StockInFreeLineInput = {
  product_id: string;
  classification: ProductClassification;
  quantity: number;
};

/**
 * The stock-in form's save: one workflow — product lines, quantities,
 * prices and FX. "draft" keeps it as a Draft (creating it, or updating the
 * draft); "receive" saves it and receives exactly those quantities at those
 * prices, in one transaction (fn_save_stock_in → fn_receive_goods). Count
 * true-ups and the invoice upload follow; if either fails it's reported as a
 * warning, not a lost receipt.
 */
export async function saveStockIn(
  input: {
    mode: "draft" | "receive";
    /** The draft being continued, or null for a new order. */
    order_id: string | null;
    supplier_id: string;
    order_date: string;
    notes: string;
    fx_adjustment: number;
    lines: StockInLineInput[];
    free_lines: StockInFreeLineInput[];
    /** Receiving only. */
    received_date: string;
    invoice_reference: string;
    rounding_adjustment: number;
  },
  invoiceFile?: File | null,
): Promise<StockInResult<{ orderId: string }>> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();
    const receiving = input.mode === "receive";
    if (!input.supplier_id) throw new Error("Select a supplier.");
    const lines = input.lines.filter((line) => line.product_id);
    if (lines.length === 0) throw new Error("Add at least one product.");
    for (const line of lines) {
      if (!(line.quantity > 0)) throw new Error("Every line needs a quantity above zero.");
      if (!(line.unit_price >= 0)) throw new Error("Prices can't be negative.");
    }
    const freeLines = input.free_lines.filter((line) => line.product_id && line.quantity > 0);
    const receivedDate = receiving ? checkReceivedDate(input.received_date) : null;
    const invoice = receiving ? checkInvoiceFile(invoiceFile) : null;
    if (receiving) await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");

    const [poNumber, storeLocationId] = await Promise.all([
      input.order_id ? Promise.resolve(null) : nextPoNumber(supabase, companyId),
      receiving ? getDefaultStoreLocationId(supabase, branch.id) : Promise.resolve(null),
    ]);
    const receiptId = receiving ? randomUUID() : null;
    const { data: orderId, error } = await supabase.rpc("fn_save_stock_in", {
      p_company_id: companyId,
      p_branch_id: branch.id,
      p_order_id: nullable(input.order_id),
      p_po_number: nullable(poNumber),
      p_supplier_id: input.supplier_id,
      p_order_date: nullable(input.order_date || singaporeToday()),
      p_notes: nullable(input.notes.trim() || null),
      p_fx_adjustment: Number.isFinite(input.fx_adjustment) ? input.fx_adjustment : 0,
      p_user: nullable(user.email),
      p_lines: lines.map((line) => ({
        product_id: line.product_id,
        classification: line.classification,
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
      p_receive: receiving,
      p_receipt_id: nullable(receiptId),
      p_received_date: nullable(receivedDate),
      p_invoice_reference: nullable(receiving ? input.invoice_reference.trim() || null : null),
      p_rounding_adjustment:
        receiving && Number.isFinite(input.rounding_adjustment) ? input.rounding_adjustment : 0,
      p_store_location_id: nullable(storeLocationId),
      p_free_lines: freeLines.map((line) => ({
        product_id: line.product_id,
        classification: line.classification,
        quantity: line.quantity,
      })),
    });
    if (error || !orderId) throw new Error(error?.message || "Could not save this order.");

    const warnings: string[] = [];
    if (receiving && receiptId) {
      const trueUpWarning = await trueUpNewReceipt(supabase, {
        companyId,
        branchId: branch.id,
        receiptId,
        createdBy: user.email,
      });
      if (trueUpWarning) warnings.push(trueUpWarning);
      if (invoice) {
        try {
          const url = await uploadInvoiceAttachment(companyId, receiptId, invoice);
          const { error: patchError } = await supabase
            .from("goods_receipts")
            .update({ invoice_attachment_url: url })
            .eq("id", receiptId);
          if (patchError) throw patchError;
        } catch (err) {
          warnings.push(
            `Received, but the invoice file couldn't be uploaded (${errorMessage(err, "upload failed")}). Edit the receipt to attach it again.`,
          );
        }
      }
    }

    revalidatePurchaseOrderPaths(orderId);
    if (receiving) revalidatePath("/home");
    return { ok: true, orderId, warning: warnings.join(" ") || undefined };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save this order.") };
  }
}

export async function addFreeGoodsReceipt(input: {
  purchase_order_id: string;
  received_date: string;
  notes: string;
  lines: { product_id: string; quantity_received: number; classification: ProductClassification }[];
}): Promise<StockInResult> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();
    const lines = input.lines.filter((line) => line.quantity_received > 0 && line.product_id);
    if (lines.length === 0) throw new Error("Add at least one free product.");
    const receivedDate = checkReceivedDate(input.received_date);
    await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");

    const storeLocationId = await getDefaultStoreLocationId(supabase, branch.id);
    const receiptId = randomUUID();
    const { error } = await supabase.rpc("fn_receive_goods", {
      p_company_id: companyId,
      p_branch_id: branch.id,
      p_purchase_order_id: input.purchase_order_id,
      p_receipt_id: receiptId,
      p_received_date: receivedDate,
      p_notes: nullable(input.notes.trim() || null),
      p_invoice_reference: nullable<string>(null),
      p_rounding_adjustment: 0,
      p_fx_adjustment: 0,
      p_user: nullable(user.email),
      p_items: lines.map((line) => ({
        purchase_order_item_id: null,
        product_id: line.product_id,
        store_location_id: storeLocationId,
        quantity_received: line.quantity_received,
        unit_cost: 0,
        classification: line.classification,
      })),
      p_free_goods_only: true,
      p_allow_over_receipt: false,
    });
    if (error) throw new Error(error.message || "Could not add the free goods.");

    const warning = await trueUpNewReceipt(supabase, {
      companyId,
      branchId: branch.id,
      receiptId,
      createdBy: user.email,
    });
    revalidatePurchaseOrderPaths(input.purchase_order_id);
    revalidatePath("/home");
    return { ok: true, warning };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not add the free goods.") };
  }
}

export async function voidPurchaseOrder(id: string): Promise<StockInResult> {
  try {
    const { supabase, companyId, branch, user } = await requireBranch();
    await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");

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
    const trueUpScopes = (receipts ?? []).map((receipt) => ({
      companyId,
      branchId: branch.id,
      receiptId: receipt.id,
    }));
    // Refuse up front if any receipt's true-ups are in use, before anything changes.
    await assertReceiptTrueUpsRemovable(
      supabase,
      trueUpScopes.map((scope) => scope.receiptId),
    );

    try {
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
      if (error) throw new Error(error.message || "Could not void this order.");
    } catch (err) {
      // Put every receipt's true-ups back as they were (the order wasn't voided).
      try {
        await restoreReceiptTrueUps(supabase, trueUpScopes, user.email);
      } catch (restoreErr) {
        throw new Error(
          `${errorMessage(err, "Could not void this order.")} Its count corrections also couldn't be restored (${errorMessage(restoreErr, "unknown error")}) — open each receipt, click Edit receipt and Save to fix them.`,
        );
      }
      throw err;
    }

    revalidatePurchaseOrderPaths(id);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not void this order.") };
  }
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
export async function deleteDraftPurchaseOrder(id: string): Promise<StockInResult> {
  try {
    const { supabase, companyId, branch } = await requireBranch();

    const { data: order, error: orderError } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", id)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error("Purchase order not found.");
    if (order.status !== "draft")
      throw new Error("Only draft orders can be deleted. Void this order instead.");

    const { count: receiptCount, error: receiptError } = await supabase
      .from("goods_receipts")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", order.id);
    if (receiptError) throw receiptError;
    if ((receiptCount ?? 0) > 0)
      throw new Error("This order has stock received on it, so it can't be deleted.");

    // Lines and audit events go with it (on delete cascade).
    const { error: deleteError } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", order.id)
      .eq("status", "draft");
    if (deleteError) throw new Error(deleteError.message || "Could not delete this draft.");

    revalidatePurchaseOrderPaths();
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not delete this draft.") };
  }
}

export async function duplicatePurchaseOrder(
  id: string,
): Promise<StockInResult<{ orderId: string }>> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();

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
        order_date: singaporeToday(),
        notes: order.notes,
        created_by: user.email,
      })
      .select("id")
      .single();
    if (createError || !newOrder)
      throw createError ?? new Error("Could not duplicate purchase order.");

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
    return { ok: true, orderId: newOrder.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not duplicate this order.") };
  }
}

/**
 * Moves a receipt's stock to its new received date in the ledger, then
 * replays cost from there and re-runs the count true-ups — the new date may
 * fall before (or no longer before) a confirmed count.
 */
async function redateReceiptLedger(
  supabase: Awaited<ReturnType<typeof requireBranch>>["supabase"],
  input: {
    companyId: string;
    branchId: string;
    receiptId: string;
    receivedDate: string;
    createdBy: string | undefined;
  },
) {
  const scope = {
    companyId: input.companyId,
    branchId: input.branchId,
    receiptId: input.receiptId,
  };
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
      if (recomputeError)
        throw new Error(recomputeError.message || "Could not update product costs.");
    }
  }

  await applyLateReceiptTrueUps(supabase, { ...scope, createdBy: input.createdBy });
}

export async function removeGoodsReceipt(goodsReceiptId: string): Promise<StockInResult> {
  try {
    const { supabase, companyId, branch, user } = await requireBranch();
    await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");

    const { data: receipt, error: receiptError } = await supabase
      .from("goods_receipts")
      .select("id, purchase_order_id, voided_at")
      .eq("id", goodsReceiptId)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (receiptError) throw receiptError;
    if (!receipt) throw new Error("Receipt not found.");
    if (receipt.voided_at) throw new Error("This receipt has already been removed.");
    await assertReceiptTrueUpsRemovable(supabase, [receipt.id]);

    // Count true-ups this receipt caused go first, so the reversal checks the
    // balance the receipt itself added. Then, for a count that had already
    // included this receipt, give back what its shortfall took off for it —
    // the count's numbers stay as counted. Undo both if anything fails.
    const trueUpScope = { companyId, branchId: branch.id, receiptId: receipt.id };
    try {
      await removeLateReceiptTrueUps(supabase, trueUpScope);
      await applyRemovedReceiptTrueUps(
        supabase,
        { ...trueUpScope, createdBy: user.email },
        "removed",
      );
      const { error } = await supabase.rpc("fn_reverse_goods_receipt", {
        p_goods_receipt_id: receipt.id,
      });
      if (error) throw new Error(error.message || "Could not remove this receipt.");
    } catch (err) {
      try {
        await restoreReceiptTrueUps(supabase, [trueUpScope], user.email);
      } catch (restoreErr) {
        throw new Error(
          `${errorMessage(err, "Could not remove this receipt.")} Its count corrections also couldn't be restored (${errorMessage(restoreErr, "unknown error")}) — click Edit receipt and Save to fix them.`,
        );
      }
      throw err;
    }

    revalidatePurchaseOrderPaths(receipt.purchase_order_id ?? undefined);
    revalidatePath("/home");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not remove this receipt.") };
  }
}

export async function updateGoodsReceiptInvoice(
  goodsReceiptId: string,
  invoiceReference: string,
  receivedDate: string,
  roundingAdjustment: number,
  fxAdjustment: number,
  invoiceFile?: File | null,
): Promise<StockInResult> {
  try {
    const { supabase, companyId, branch, user } = await requireBranch();
    const date = checkReceivedDate(receivedDate);
    const invoice = checkInvoiceFile(invoiceFile);

    const { data: receipt, error: receiptError } = await supabase
      .from("goods_receipts")
      .select("id, purchase_order_id, received_date, voided_at")
      .eq("id", goodsReceiptId)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (receiptError) throw receiptError;
    if (!receipt) throw new Error("Receipt not found.");
    if (receipt.voided_at) throw new Error("This receipt has been removed, so it can't be edited.");

    // Moving stock in the ledger (or re-running its count true-ups) can't
    // happen during a count, and is checked up front so it can't half-fail.
    await assertNoActiveCount(supabase, companyId, branch.id, "receive stock");
    await assertReceiptTrueUpsRemovable(supabase, [receipt.id]);
    const scope = { companyId, branchId: branch.id, receiptId: receipt.id };
    const dateChanged = receipt.received_date !== date;

    // The ledger moves first and the receipt's own date last, so a failure
    // never leaves the receipt showing a date its stock isn't on.
    try {
      if (dateChanged) {
        await redateReceiptLedger(supabase, {
          ...scope,
          receivedDate: date,
          createdBy: user.email,
        });
      } else {
        // Same date: still re-run the count true-ups, so saving a receipt
        // always leaves them matching the current rules and counts.
        await removeLateReceiptTrueUps(supabase, scope);
        await applyLateReceiptTrueUps(supabase, { ...scope, createdBy: user.email });
      }
      const { error: updateError } = await supabase
        .from("goods_receipts")
        .update({
          invoice_reference: invoiceReference.trim() || null,
          received_date: date,
          rounding_adjustment: Number.isFinite(roundingAdjustment) ? roundingAdjustment : 0,
          fx_adjustment: Number.isFinite(fxAdjustment) ? fxAdjustment : 0,
        })
        .eq("id", receipt.id);
      if (updateError) throw updateError;
    } catch (err) {
      try {
        if (dateChanged) {
          await redateReceiptLedger(supabase, {
            ...scope,
            receivedDate: receipt.received_date,
            createdBy: user.email,
          });
        } else {
          await restoreReceiptTrueUps(supabase, [scope], user.email);
        }
      } catch (restoreErr) {
        throw new Error(
          `${errorMessage(err, "Could not save this receipt.")} Its stock or count corrections also couldn't be put back (${errorMessage(restoreErr, "unknown error")}) — try saving it again.`,
        );
      }
      throw err;
    }

    if (receipt.purchase_order_id && dateChanged) {
      const { error: auditError } = await supabase.from("purchase_order_audit_events").insert({
        company_id: companyId,
        purchase_order_id: receipt.purchase_order_id,
        event_type: "receipt_date_changed",
        actor_name: user.email ?? "Unknown",
        remarks: `Received date changed from ${receipt.received_date} to ${date}.`,
      });
      if (auditError) throw auditError;
    }

    let warning: string | undefined;
    if (invoice) {
      try {
        const url = await uploadInvoiceAttachment(companyId, receipt.id, invoice);
        const { error: patchError } = await supabase
          .from("goods_receipts")
          .update({ invoice_attachment_url: url })
          .eq("id", receipt.id);
        if (patchError) throw patchError;
      } catch (err) {
        warning = `Saved, but the invoice file couldn't be uploaded (${errorMessage(err, "upload failed")}). Try attaching it again.`;
      }
    }

    revalidatePurchaseOrderPaths(receipt.purchase_order_id ?? undefined);
    revalidatePath("/home");
    return { ok: true, warning };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save this receipt.") };
  }
}
