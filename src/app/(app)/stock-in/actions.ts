"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { nextPoNumber } from "@/lib/data/orders";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
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
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  const lines = input.lines.filter((line) => line.product_id && line.quantity_ordered > 0);

  if (lines.length === 0) {
    throw new Error("Add at least one order line.");
  }

  const poNumber = await nextPoNumber(supabase, companyId);
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
  redirect(`/stock-in/${order.id}`);
}

export async function updatePurchaseOrder(input: {
  purchase_order_id: string;
  supplier_id: string;
  order_date: string;
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
    .select("id, branch_id")
    .eq("id", input.purchase_order_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (orderError || !order) throw orderError ?? new Error("Purchase order not found.");

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
  const { supabase, companyId, branch } = await requireBranch();
  const id = String(formData.get("id") ?? "");

  const { error } = await supabase.rpc("fn_void_purchase_order", {
    p_purchase_order_id: id,
    p_company_id: companyId,
    p_branch_id: branch.id,
  });

  if (error) throw new Error(error.message || "Could not void this order.");
  revalidatePurchaseOrderPaths(id);
  revalidatePath("/");
  redirect(`/stock-in/${id}`);
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

export async function removeGoodsReceipt(goodsReceiptId: string) {
  const { supabase, companyId, branch } = await requireBranch();

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id, purchase_order_id, voided_at")
    .eq("id", goodsReceiptId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");
  if (receipt.voided_at) throw new Error("This receipt has already been removed.");

  const { error } = await supabase.rpc("fn_reverse_goods_receipt", { p_goods_receipt_id: receipt.id });
  if (error) throw new Error(error.message || "Could not remove this receipt.");

  revalidatePurchaseOrderPaths(receipt.purchase_order_id ?? undefined);
}

export async function updateGoodsReceiptInvoice(
  goodsReceiptId: string,
  invoiceReference: string,
  receivedDate: string,
  roundingAdjustment: number,
  invoiceFile?: File | null,
) {
  const { supabase, companyId, branch, user } = await requireBranch();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
    throw new Error("Enter a valid received date.");
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id, purchase_order_id, received_date")
    .eq("id", goodsReceiptId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (receiptError || !receipt) throw receiptError ?? new Error("Receipt not found.");

  const patch: {
    invoice_reference: string | null;
    received_date: string;
    rounding_adjustment: number;
    invoice_attachment_url?: string;
  } = {
    invoice_reference: invoiceReference.trim() || null,
    received_date: receivedDate,
    rounding_adjustment: Number.isFinite(roundingAdjustment) ? roundingAdjustment : 0,
  };
  if (invoiceFile && invoiceFile.size > 0) {
    patch.invoice_attachment_url = await uploadInvoiceAttachment(companyId, receipt.id, invoiceFile);
  }

  const { error: updateError } = await supabase.from("goods_receipts").update(patch).eq("id", receipt.id);
  if (updateError) throw updateError;

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
