import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getCatalogProducts } from "@/lib/data/products";
import { isAvailableInTunai } from "@/lib/labels";
import { productLabel } from "@/lib/format";
import { NewStockOutForm } from "./new-stock-out-form";

export default async function NewStockOutPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const catalog = await getCatalogProducts(supabase, companyId);
  const branchProducts = catalog.filter((product) => product.branchIds.includes(branch.id));

  const retailProducts = branchProducts.filter((product) =>
    isAvailableInTunai(product.classificationsByBranch[branch.id] ?? []),
  );
  const inhouseProducts = branchProducts.filter((product) =>
    (product.classificationsByBranch[branch.id] ?? []).includes("inhouse"),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock-out" className="text-sm text-muted underline">
          ← Back to Stock-out
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New stock-out</h1>
        <p className="mt-1 text-sm text-muted">Working in {branch.displayName}.</p>
      </div>

      <NewStockOutForm
        branchId={branch.id}
        branchName={branch.displayName}
        retailProducts={retailProducts.map((product) => ({
          id: product.id,
          label: productLabel(product),
          tagNames: product.tagNames,
        }))}
        inhouseProducts={inhouseProducts.map((product) => ({
          id: product.id,
          label: productLabel(product),
          tagNames: product.tagNames,
        }))}
      />
    </div>
  );
}
