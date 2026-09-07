import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getInvoices(supabase: Client, companyId: string, branchId?: string) {
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, status, total_gross_amount, suppliers(supplier_name), purchase_orders(po_number)",
    )
    .eq("company_id", companyId)
    .order("invoice_date", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInvoice(supabase: Client, companyId: string, id: string, branchId?: string) {
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, status, total_amount, total_tax_amount, total_gross_amount, purchase_discount_amount, supplier_id, purchase_order_id, branch_id, suppliers(supplier_name), purchase_orders(po_number)",
    )
    .eq("company_id", companyId)
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query.single();
  if (error) throw error;

  const [{ data: items, error: itemsError }, { data: recon, error: reconError }] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, quantity, unit_price, tax_amount, purchase_discount_amount, line_total, products(sku, name, order_name)")
      .eq("invoice_id", id)
      .order("id"),
    supabase
      .from("invoice_reconciliation")
      .select("invoice_stated_total, line_items_total, variance")
      .eq("invoice_id", id)
      .maybeSingle(),
  ]);

  if (itemsError) throw itemsError;
  if (reconError) throw reconError;

  return { ...data, items: items ?? [], reconciliation: recon };
}

export async function getUninvoicedReceipts(supabase: Client, companyId: string, branchId: string) {
  const { data, error } = await supabase
    .from("goods_receipts")
    .select(
      "id, received_date, notes, purchase_order_id, purchase_orders(po_number, supplier_id, suppliers(supplier_name))",
    )
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .is("invoice_id", null)
    .order("received_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getUninvoicedReceiptsForOrder(
  supabase: Client,
  companyId: string,
  purchaseOrderId: string,
) {
  const { data, error } = await supabase
    .from("goods_receipts")
    .select("id")
    .eq("company_id", companyId)
    .eq("purchase_order_id", purchaseOrderId)
    .is("invoice_id", null);

  if (error) throw error;
  return data ?? [];
}
