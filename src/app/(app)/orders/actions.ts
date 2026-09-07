"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { nextPoNumber } from "@/lib/data/orders";
import type { ProductClassification } from "@/lib/labels";

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
  expected_delivery_date: string;
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
      expected_delivery_date: input.expected_delivery_date || null,
      notes: input.notes || null,
      created_by: user.email,
    })
    .select("id")
    .single();

  if (error || !order) throw error ?? new Error("Could not create purchase order.");

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    lines.map((line) => ({
      purchase_order_id: order.id,
      product_id: line.product_id,
      classification: line.classification,
      quantity_ordered: line.quantity_ordered,
      unit_price: line.unit_price,
    })),
  );

  if (itemsError) throw itemsError;

  revalidatePath("/orders");
  revalidatePath("/");
  redirect(`/orders/${order.id}`);
}

export async function markPurchaseOrderSent(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const id = String(formData.get("id") ?? "");

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("status", "draft");

  if (error) throw error;
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/");
}

export async function receivePurchaseOrder(input: {
  purchase_order_id: string;
  received_date: string;
  notes: string;
  lines: {
    purchase_order_item_id: string;
    product_id: string;
    store_location_id: string;
    quantity_received: number;
    unit_cost: number;
  }[];
}) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const lines = input.lines.filter((line) => line.quantity_received > 0 && line.store_location_id);

  if (lines.length === 0) {
    throw new Error("Enter a received quantity for at least one line.");
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
      unit_cost: line.unit_cost,
    })),
  );

  if (itemsError) throw itemsError;

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/orders");
  revalidatePath("/");
  redirect(`/orders/${order.id}`);
}
