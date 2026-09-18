import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { btnClass, workingIn } from "@/lib/ui";

export default async function HomePage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="mt-1 text-sm text-muted">
            Every product's current inventory balance at {branch.displayName}, with the full ledger behind
            each one.
          </p>
        </div>
        <Link href="/home/products" className={btnClass}>
          View products
        </Link>
      </div>
    </div>
  );
}
