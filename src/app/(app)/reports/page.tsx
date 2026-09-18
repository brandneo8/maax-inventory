import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { workingIn } from "@/lib/ui";

const REPORTS = [
  {
    href: "/reports/monthly-inventory",
    title: "Monthly inventory balance",
    description: "Month-by-month inventory value roll-forward and cost of goods sold.",
  },
  {
    href: "/reports/product-margins",
    title: "Product margins",
    description: "Coming soon.",
  },
];

export default async function ReportsPage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-xl border border-border bg-card p-5 hover:border-slate-400"
          >
            <h2 className="text-base font-semibold">{report.title}</h2>
            <p className="mt-1 text-sm text-muted">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
