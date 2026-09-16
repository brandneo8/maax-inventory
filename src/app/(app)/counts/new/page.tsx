import Link from "next/link";
import { requireBranch } from "@/lib/auth";

export default async function NewCountChooserPage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/counts" className="text-sm text-muted underline">
          Back to counts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New inventory count</h1>
        <p className="mt-1 text-sm text-muted">Working in {branch.displayName}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/counts/new/regular"
          className="block rounded-xl border border-border bg-card p-5 hover:border-slate-400"
        >
          <h2 className="text-base font-semibold">Regular count</h2>
          <p className="mt-1 text-sm text-muted">
            Compare what you count to the ledger&apos;s expected quantity. Shortfalls cost at the average
            in effect on the count date; surpluses blend at the current average.
          </p>
        </Link>
        <Link
          href="/counts/new/opening-balance"
          className="block rounded-xl border border-border bg-card p-5 hover:border-slate-400"
        >
          <h2 className="text-base font-semibold">Opening balance count</h2>
          <p className="mt-1 text-sm text-muted">
            For SKUs with no reliable cost history. You enter a cost for every counted product yourself,
            at the review step, instead of relying on the existing average.
          </p>
        </Link>
      </div>
    </div>
  );
}
