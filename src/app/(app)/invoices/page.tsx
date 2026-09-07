import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getInvoices } from "@/lib/data/invoices";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/labels";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";

export default async function InvoicesPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const invoices = await getInvoices(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted">
            Working in {branch.displayName}. Create an invoice from a goods receipt at this salon.
          </p>
        </div>
        <Link className={btnClass} href="/invoices/new">
          New invoice
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Invoice</th>
              <th className={thClass}>Supplier</th>
              <th className={thClass}>PO</th>
              <th className={thClass}>Date</th>
              <th className={thClass}>Stated total</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={6}>
                  No invoices yet. Receive an order first, then sync it here.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const supplier = Array.isArray(invoice.suppliers)
                  ? invoice.suppliers[0]
                  : invoice.suppliers;
                const po = Array.isArray(invoice.purchase_orders)
                  ? invoice.purchase_orders[0]
                  : invoice.purchase_orders;
                return (
                  <tr key={invoice.id}>
                    <td className={tdClass}>
                      <Link className="underline" href={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className={tdClass}>{supplier?.supplier_name ?? "—"}</td>
                    <td className={tdClass}>{po?.po_number ?? "—"}</td>
                    <td className={tdClass}>{formatDate(invoice.invoice_date)}</td>
                    <td className={tdClass}>{formatMoney(invoice.total_gross_amount)}</td>
                    <td className={tdClass}>{invoiceStatusLabel(invoice.status)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
