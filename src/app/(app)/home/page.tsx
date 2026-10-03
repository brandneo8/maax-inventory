import Link from "next/link";
import { ArrowRight, PackageMinus, PackagePlus, ShoppingBag } from "lucide-react";
import { requireBranch } from "@/lib/auth";
import { getOrderBalanceProducts } from "@/lib/data/products";
import { getMonthToDateSalesByProduct } from "@/lib/data/product-sales";
import { getMonthlyInventoryReport } from "@/lib/data/stock";
import {
  formatMoney,
  formatMonthLabel,
  productDisplayName,
  shiftMonth,
  singaporeToday,
} from "@/lib/format";
import { workingIn } from "@/lib/ui";
import { HomeTables, type HomeProduct } from "./home-tables";
import { MonthRangePicker } from "./month-range-picker";
import { MonthlyChart } from "./monthly-chart";

/** Chart default: the last 6 months. The products table defaults to this month. */
const CHART_MONTHS = 6;
/** Widest range either from/to picker allows (same cap as the Monthly inventory report). */
const MAX_RANGE_MONTHS = 24;

const isMonth = (value: string | undefined): value is string =>
  !!value && /^\d{4}-\d{2}$/.test(value);

/**
 * A from/to month range from the URL: defaults to the last `defaultMonths`
 * months, never past this month, and never wider than MAX_RANGE_MONTHS.
 */
function monthRange(
  currentMonth: string,
  from: string | undefined,
  to: string | undefined,
  defaultMonths: number,
) {
  let end = isMonth(to) && to <= currentMonth ? to : currentMonth;
  let start = isMonth(from) && from <= currentMonth ? from : shiftMonth(end, -(defaultMonths - 1));
  if (start > end) [start, end] = [end, start];
  if (shiftMonth(start, MAX_RANGE_MONTHS - 1) < end)
    start = shiftMonth(end, -(MAX_RANGE_MONTHS - 1));
  return { start, end };
}

// Named by the task; icons match the sidebar so each card still reads as its page.
const SHORTCUTS = [
  {
    href: "/orders",
    title: "Plan what to order",
    description: "Check balances and usage, then plan and raise purchase orders.",
    icon: ShoppingBag,
  },
  {
    href: "/stock-in",
    title: "Receive orders",
    description: "Receive purchase orders against the invoice, and add free goods.",
    icon: PackagePlus,
  },
  {
    href: "/stock-out",
    title: "Product usage",
    description: "Record products opened for use in the salon.",
    icon: PackageMinus,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; pfrom?: string; pto?: string }>;
}) {
  const { supabase, companyId, branch, isAdmin } = await requireBranch();
  const currentMonth = singaporeToday().slice(0, 7);
  const params = await searchParams;
  const chart = monthRange(currentMonth, params.from, params.to, CHART_MONTHS);
  const productRange = monthRange(currentMonth, params.pfrom, params.pto, 1);
  const productMonths = { from: productRange.start, to: productRange.end };
  const [balanceProducts, salesByProduct, report] = await Promise.all([
    getOrderBalanceProducts(supabase, companyId, branch.id, productMonths),
    getMonthToDateSalesByProduct(supabase, companyId, branch.id, productMonths),
    getMonthlyInventoryReport(supabase, companyId, branch.id, chart.start, chart.end),
  ]);
  const chartPurchases = report.ordered.reduce((sum, value) => sum + value, 0);
  const chartCogs = report.cogsTotal.reduce((sum, value) => sum + value, 0);
  const products: HomeProduct[] = balanceProducts.map((product) => ({
    id: product.id,
    label: productDisplayName(product) || product.sku || "—",
    sku: product.sku,
    brand: product.brand,
    classifications: product.classifications,
    onHand: product.onHand,
    monthToDateUse: product.monthToDateUse,
    monthToDateCost: product.monthToDateCost,
    monthToDateSales: salesByProduct.get(product.id) ?? 0,
    isBundle: product.isBundle,
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      {/* Ordering, receiving and stock-outs are admin pages; stylists see Home and Reports only. */}
      {isAdmin ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">Key actions</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {SHORTCUTS.map(({ href, title, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-sky-500"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sky-700"
                    aria-hidden
                  />
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Reports</h2>
          <Link className="text-sm text-sky-700 underline" href="/reports/monthly-inventory">
            Monthly inventory report
          </Link>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-card p-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Purchases and cost of goods sold</h3>
              <p className="text-sm text-muted">
                {formatMonthLabel(chart.start)} to {formatMonthLabel(chart.end)} at{" "}
                {branch.displayName} (up to {MAX_RANGE_MONTHS} months). Hover a month for its
                amounts.
              </p>
            </div>
            {/* Totals for the picked months (the same range as the chart), labelled in its bar colours. */}
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              <div>
                <dt className="text-sm font-medium text-sky-700">Total purchases</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatMoney(chartPurchases)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-amber-700">Total cost of goods sold</dt>
                <dd className="text-2xl font-semibold tabular-nums">{formatMoney(chartCogs)}</dd>
              </div>
            </dl>
            <MonthRangePicker
              from={chart.start}
              to={chart.end}
              maxMonth={currentMonth}
              fromParam="from"
              toParam="to"
              idPrefix="home-chart"
            />
          </div>
          <MonthlyChart months={report.months} purchases={report.ordered} cogs={report.cogsTotal} />
        </div>

        <HomeTables
          products={products}
          branchName={branch.displayName}
          from={productRange.start}
          to={productRange.end}
          currentMonth={currentMonth}
        />
      </section>
    </div>
  );
}
