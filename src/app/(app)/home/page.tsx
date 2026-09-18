import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { countTunaiProducts } from "@/lib/data/products";
import { btnClass, workingIn } from "@/lib/ui";

export default async function HomePage() {
  const { supabase, branch } = await requireBranch();
  const tunaiCount = await countTunaiProducts(supabase, branch.id);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold">Tunai</h2>
            <p className="mt-1 text-sm text-muted">
              {tunaiCount} product{tunaiCount === 1 ? "" : "s"} available in Tunai at {branch.displayName}.
            </p>
          </div>
          <Link href="/home/tunai" className={btnClass}>
            View Tunai products
          </Link>
        </div>
      </section>
    </div>
  );
}
