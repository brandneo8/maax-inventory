import { requireBranch } from "@/lib/auth";
import { getBranchOnHand, getCatalogProducts } from "@/lib/data/products";
import { BranchProductsTable } from "./branch-products-table";

export default async function ProductsPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const catalog = await getCatalogProducts(supabase, companyId);
  const products = catalog.filter((product) => product.branchIds.includes(branch.id));
  const onHand = await getBranchOnHand(
    supabase,
    companyId,
    branch.id,
    products.map((product) => product.id),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. This list is the inventory assigned to this salon.
        </p>
      </div>

      <section className="space-y-4">
        <BranchProductsTable
          products={products.map((product) => ({
            ...product,
            onHand: onHand.get(product.id) ?? 0,
          }))}
        />
      </section>
    </div>
  );
}
