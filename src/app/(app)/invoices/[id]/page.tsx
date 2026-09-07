import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getInvoice } from "@/lib/data/invoices";
import { formatDate, formatMoney, formatQty, productLabel } from "@/lib/format";
import { INVOICE_STATUSES, invoiceStatusLabel } from "@/lib/labels";
import { btnClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { updateInvoiceStatus } from "../actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const invoice = await getInvoice(supabase, companyId, id, branch.id).catch(() => null);

  if (!invoice) notFound();

  const supplier = Array.isArray(invoice.suppliers) ? invoice.suppliers[0] : invoice.suppliers;
  const po = Array.isArray(invoice.purchase_orders) ? invoice.purchase_orders[0] : invoice.purchase_orders;
  const variance = Number(invoice.reconciliation?.variance ?? 0);
  const matched = Math.abs(variance) < 0.01;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-muted underline">
          Back to invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoice_number}</h1>
            <p className="mt-1 text-sm text-muted">
              {supplier?.supplier_name} · {po?.po_number ?? "No PO"} · {invoiceStatusLabel(invoice.status)}
            </p>
          </div>
          <form action={updateInvoiceStatus} className="flex items-end gap-2">
            <input type="hidden" name="id" value={invoice.id} />
            <label className="space-y-1 text-sm">
              <span>Status</span>
              <select className={fieldClass} name="status" defaultValue={invoice.status}>
                {INVOICE_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <button className={btnClass} type="submit">
              Update
            </button>
          </form>
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm ${
          matched ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <p className="font-medium">{matched ? "Invoice matches receipt lines" : "Variance needs review"}</p>
        <p className="mt-1">
          Stated {formatMoney(invoice.reconciliation?.invoice_stated_total)} · lines{" "}
          {formatMoney(invoice.reconciliation?.line_items_total)} · variance {formatMoney(variance)}
        </p>
        {!matched ? (
          <p className="mt-1">
            Adjust an extra discount on the invoice header or check the receipt costs before marking
            it paid.
          </p>
        ) : null}
      </div>

      <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Invoice date</dt>
          <dd>{formatDate(invoice.invoice_date)}</dd>
        </div>
        <div>
          <dt className="text-muted">Tax</dt>
          <dd>{formatMoney(invoice.total_tax_amount)}</dd>
        </div>
        <div>
          <dt className="text-muted">Header discount</dt>
          <dd>{formatMoney(invoice.purchase_discount_amount)}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={thClass}>Qty</th>
              <th className={thClass}>Unit</th>
              <th className={thClass}>Discount</th>
              <th className={thClass}>Tax</th>
              <th className={thClass}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => {
              const product = Array.isArray(item.products) ? item.products[0] : item.products;
              return (
                <tr key={item.id}>
                  <td className={tdClass}>
                    {productLabel(product)}
                  </td>
                  <td className={tdClass}>{formatQty(item.quantity)}</td>
                  <td className={tdClass}>{formatMoney(item.unit_price)}</td>
                  <td className={tdClass}>{formatMoney(item.purchase_discount_amount)}</td>
                  <td className={tdClass}>{formatMoney(item.tax_amount)}</td>
                  <td className={tdClass}>{formatMoney(item.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
