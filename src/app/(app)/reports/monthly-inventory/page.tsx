import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getMonthlyInventoryReport } from "@/lib/data/stock";
import { formatMoney, formatMonthLabel, singaporeToday } from "@/lib/format";
import { btnClass, fieldClass, tableClass, tdClass, thClass, workingIn } from "@/lib/ui";

const MAX_MONTHS = 24;
const DEFAULT_WINDOW = 6;

// Both tables below share these exact column widths so their month columns
// line up with each other. table-fixed only honors them once the table's
// own width can't shrink to fit its container, hence the minWidth style
// on the <table> itself — that's also what decides when the surrounding
// overflow-x-auto div starts scrolling instead of squeezing columns.
const LABEL_COL_WIDTH = 280;
const MONTH_COL_WIDTH = 120;

function reportTableMinWidth(monthCount: number) {
  return LABEL_COL_WIDTH + monthCount * MONTH_COL_WIDTH;
}

function ReportColgroup({ monthCount }: { monthCount: number }) {
  return (
    <colgroup>
      <col style={{ width: LABEL_COL_WIDTH }} />
      {Array.from({ length: monthCount }, (_, index) => (
        <col key={index} style={{ width: MONTH_COL_WIDTH }} />
      ))}
    </colgroup>
  );
}

function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}$/.test(value);
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonthNum = (total % 12) + 1;
  return `${nextYear}-${String(nextMonthNum).padStart(2, "0")}`;
}

function resolveRange(params: { from?: string; to?: string }) {
  const currentMonth = singaporeToday().slice(0, 7);
  let from = isValidMonth(params.from) ? params.from : shiftMonth(currentMonth, -(DEFAULT_WINDOW - 1));
  let to = isValidMonth(params.to) ? params.to : currentMonth;
  if (from > to) [from, to] = [to, from];
  if (shiftMonth(from, MAX_MONTHS - 1) < to) {
    from = shiftMonth(to, -(MAX_MONTHS - 1));
  }
  return { from, to };
}

type InventoryGroup = "brand" | "tag";

function groupHref(from: string, to: string, group: InventoryGroup) {
  return `/reports/monthly-inventory?${new URLSearchParams({ from, to, group }).toString()}`;
}

export default async function MonthlyInventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
}) {
  const params = await searchParams;
  const { from, to } = resolveRange(params);
  const group: InventoryGroup = params.group === "tag" ? "tag" : "brand";
  const { supabase, companyId, branch } = await requireBranch();
  const report = await getMonthlyInventoryReport(supabase, companyId, branch.id, from, to);
  const inventoryGroups = group === "tag" ? report.inventoryByTag : report.inventoryByBrand;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/reports" className="text-sm text-muted hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Monthly inventory balance</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1 text-sm">
          <span>From</span>
          <input className={fieldClass} type="month" name="from" defaultValue={from} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>To</span>
          <input className={fieldClass} type="month" name="to" defaultValue={to} />
        </label>
        <button className={btnClass} type="submit">
          Apply
        </button>
        <span className="text-xs text-muted">Up to {MAX_MONTHS} months at a time.</span>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Inventory balance</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={`${tableClass} table-fixed`} style={{ width: "100%", minWidth: reportTableMinWidth(report.months.length) }}>
            <ReportColgroup monthCount={report.months.length} />
            <thead>
              <tr>
                <th className={thClass}>&nbsp;</th>
                {report.months.map((month) => (
                  <th key={month} className={`${thClass} text-right`}>
                    {formatMonthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdClass}>Opening inventory balance</td>
                {report.openingBalance.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={tdClass}>Inventory ordered</td>
                {report.ordered.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={tdClass}>Inventory used</td>
                {report.used.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(-value)}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td className={tdClass}>Closing inventory balance</td>
                {report.closingBalance.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Inventory summary</h2>
          <div className="flex gap-2 text-sm">
            <Link
              href={groupHref(from, to, "brand")}
              className={`rounded-lg px-3 py-1.5 ${
                group === "brand" ? "bg-slate-900 text-white" : "border border-border bg-white hover:bg-slate-50"
              }`}
            >
              By brand
            </Link>
            <Link
              href={groupHref(from, to, "tag")}
              className={`rounded-lg px-3 py-1.5 ${
                group === "tag" ? "bg-slate-900 text-white" : "border border-border bg-white hover:bg-slate-50"
              }`}
            >
              By tag
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted">Closing inventory $ balance for each month, grouped by {group}.</p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={`${tableClass} table-fixed`} style={{ width: "100%", minWidth: reportTableMinWidth(report.months.length) }}>
            <ReportColgroup monthCount={report.months.length} />
            <thead>
              <tr>
                <th className={thClass}>&nbsp;</th>
                {report.months.map((month) => (
                  <th key={month} className={`${thClass} text-right`}>
                    {formatMonthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold">
                <td className={tdClass}>Total</td>
                {report.closingBalance.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              {inventoryGroups.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={report.months.length + 1}>
                    No inventory value in this range yet.
                  </td>
                </tr>
              ) : (
                inventoryGroups.map((row) => (
                  <tr key={row.label}>
                    <td className={tdClass}>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={report.months[index]} className={`${tdClass} text-right`}>
                        {formatMoney(value)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {group === "tag" ? (
          <p className="text-xs text-muted">
            A product with more than one tag has its balance counted under every tag it carries, so
            these rows can add up to more than the closing inventory balance above.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cost of goods sold</h2>
        <p className="text-sm text-muted">
          Matches the inventory used $ amount above — everything consumed that month, costed at the
          weighted average in place when it left inventory.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={`${tableClass} table-fixed`} style={{ width: "100%", minWidth: reportTableMinWidth(report.months.length) }}>
            <ReportColgroup monthCount={report.months.length} />
            <thead>
              <tr>
                <th className={thClass}>&nbsp;</th>
                {report.months.map((month) => (
                  <th key={month} className={`${thClass} text-right`}>
                    {formatMonthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold">
                <td className={tdClass}>Cost of goods sold</td>
                {report.used.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={`${tdClass} pt-4 text-muted`} colSpan={report.months.length + 1}>
                  Breakdown
                </td>
              </tr>
              <tr>
                <td className={tdClass}>Cost of retail</td>
                {report.cogsRetail.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={tdClass}>Cost of in-house use</td>
                {report.cogsInhouse.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              {report.cogsInhouseByTag.map((tag) => (
                <tr key={tag.tagName}>
                  <td className={`${tdClass} pl-8 text-muted`}>↳ {tag.tagName}</td>
                  {tag.values.map((value, index) => (
                    <td key={report.months[index]} className={`${tdClass} text-right text-muted`}>
                      {formatMoney(value)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className={tdClass}>Cost of GWP</td>
                {report.cogsGwp.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={tdClass}>Cost of inventory count shortfall (wastage)</td>
                {report.cogsWastage.map((value, index) => (
                  <td key={report.months[index]} className={`${tdClass} text-right`}>
                    {formatMoney(value)}
                  </td>
                ))}
              </tr>
              {report.cogsOther.some((value) => value !== 0) ? (
                <tr>
                  <td className={tdClass}>Other ledger adjustments</td>
                  {report.cogsOther.map((value, index) => (
                    <td key={report.months[index]} className={`${tdClass} text-right`}>
                      {formatMoney(value)}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Retail, in-house use, GWP, and count-driven shortfalls together make up the total above, split
          by each transaction&apos;s type. A product with more than one tag has its in-house cost counted
          under every tag it carries, so the tag rows can add up to more than &quot;Cost of in-house
          use&quot;.
        </p>
      </section>
    </div>
  );
}
