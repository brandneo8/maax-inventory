"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import type { InvoiceStatus } from "@/lib/labels";

export async function createInvoiceFromReceipt(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const receiptId = String(formData.get("goods_receipt_id") ?? "");
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const invoiceDate = String(formData.get("invoice_date") ?? "");
  const totalAmount = Number(formData.get("total_amount") ?? 0);
  const totalTaxAmount = Number(formData.get("total_tax_amount") ?? 0);
  const totalGrossAmount = Number(formData.get("total_gross_amount") ?? 0);
  const purchaseDiscountAmount = Number(formData.get("purchase_discount_amount") ?? 0);

  if (!receiptId || !invoiceNumber || !invoiceDate) {
    throw new Error("Invoice number, date, and a goods receipt are required.");
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select("id, purchase_order_id, invoice_id, purchase_orders(supplier_id)")
    .eq("id", receiptId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (receiptError || !receipt) throw receiptError ?? new Error("Goods receipt not found.");
  if (receipt.invoice_id) throw new Error("That receipt already has an invoice.");

  const purchaseOrder = Array.isArray(receipt.purchase_orders)
    ? receipt.purchase_orders[0]
    : receipt.purchase_orders;
  const supplierId = purchaseOrder?.supplier_id;
  if (!supplierId) throw new Error("This receipt is not linked to a supplier via a purchase order.");

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      supplier_id: supplierId,
      purchase_order_id: receipt.purchase_order_id,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      total_amount: totalAmount,
      total_tax_amount: totalTaxAmount,
      total_gross_amount: totalGrossAmount || totalAmount + totalTaxAmount,
      purchase_discount_amount: purchaseDiscountAmount,
      status: "unpaid",
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) throw invoiceError ?? new Error("Could not create invoice.");

  const { error: rpcError } = await supabase.rpc("fn_generate_invoice_items_from_receipt", {
    p_invoice_id: invoice.id,
    p_goods_receipt_id: receipt.id,
  });
  if (rpcError) throw rpcError;

  const { error: linkError } = await supabase
    .from("goods_receipts")
    .update({ invoice_id: invoice.id })
    .eq("id", receipt.id);
  if (linkError) throw linkError;

  revalidatePath("/invoices");
  revalidatePath("/orders");
  redirect(`/invoices/${invoice.id}`);
}

export async function updateInvoiceStatus(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as InvoiceStatus;

  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id);

  if (error) throw error;
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}
