import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getUninvoicedReceipts } from "@/lib/data/invoices";
import { formatDate } from "@/lib/format";
import { InvoiceForm } from "./invoice-form";

export default async function NewInvoicePage() {
  const { supabase, companyId, branch } = await requireBranch();
  const receipts = await getUninvoicedReceipts(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-muted underline">
          Back to invoices
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New invoice</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Lines are copied from a receipt at this salon.
        </p>
      </div>

      {receipts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          No uninvoiced receipts for this branch. Receive a purchase order first.
        </p>
      ) : (
        <InvoiceForm
          key={branch.id}
          receipts={receipts.map((receipt) => {
            const po = Array.isArray(receipt.purchase_orders)
              ? receipt.purchase_orders[0]
              : receipt.purchase_orders;
            const supplier = po
              ? Array.isArray(po.suppliers)
                ? po.suppliers[0]
                : po.suppliers
              : null;
            return {
              id: receipt.id,
              label: `${formatDate(receipt.received_date)} · ${supplier?.supplier_name ?? "Supplier"} · ${po?.po_number ?? "No PO"}`,
            };
          })}
        />
      )}
    </div>
  );
}
