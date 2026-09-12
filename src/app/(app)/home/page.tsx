import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getCatalogProducts } from "@/lib/data/products";
import { isAvailableInTunai } from "@/lib/labels";
import { btnClass, workingIn } from "@/lib/ui";

export default async function HomePage() {
  const { supabase, companyId, branch } = await requireBranch();
  const catalog = await getCatalogProducts(supabase, companyId);
  const branchProducts = catalog.filter((product) => product.branchIds.includes(branch.id));
  const productCount = branchProducts.length;
  const tunaiCount = branchProducts.filter((product) => isAvailableInTunai(product.classifications)).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-lg font-semibold">Products</h2>
            <p className="mt-1 text-sm text-muted">
              {productCount} product{productCount === 1 ? "" : "s"} assigned to {branch.displayName}.
            </p>
          </div>
          <Link href="/home/products" className={btnClass}>
            View products
          </Link>
        </div>
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
