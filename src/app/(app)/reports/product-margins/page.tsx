import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { workingIn } from "@/lib/ui";

export default async function ProductMarginsReportPage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/reports" className="text-sm text-muted hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Product margins</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted">Coming soon.</p>
    </div>
  );
}
