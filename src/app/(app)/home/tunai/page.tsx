import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getTunaiProducts } from "@/lib/data/products";
import { TunaiTable } from "./tunai-table";

export default async function HomeTunaiPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const withOnHand = await getTunaiProducts(supabase, companyId, branch.id);

  const retailProducts = withOnHand.filter(
    (product) => product.classifications.includes("retail") || product.classifications.includes("retail_inhouse"),
  );
  const gwpProducts = withOnHand.filter((product) => product.classifications.includes("gwp"));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/home" className="text-sm text-muted underline">
          ← Back to Home
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tunai</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Products available in Tunai (Retail, GWP, or Retail + in-house).
        </p>
      </div>

      <TunaiTable
        title="Retail"
        description="Retail and Retail + in-house products."
        products={retailProducts}
        emptyMessage="No retail products at this salon are available in Tunai yet."
      />

      <TunaiTable
        title="GWP"
        description="Gift-with-purchase products."
        products={gwpProducts}
        emptyMessage="No GWP products at this salon are available in Tunai yet."
      />
    </div>
  );
}
