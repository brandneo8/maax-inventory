import { requireAdmin } from "@/lib/auth";
import { getBranches, getTags } from "@/lib/data/lookups";
import { getPendingBranchProductRequests } from "@/lib/data/orders";
import { getCatalogProducts } from "@/lib/data/products";
import { getCurrentStock } from "@/lib/data/stock";
import { productDisplayName } from "@/lib/format";
import { salonName } from "@/lib/labels";
import { BranchAssignmentReport } from "./branch-assignment-report";

export default async function AdminBranchesPage() {
  const { supabase, companyId } = await requireAdmin();
  const [branches, products, tags, pendingRequests, stock] = await Promise.all([
    getBranches(supabase, companyId),
    getCatalogProducts(supabase, companyId),
    getTags(supabase, companyId),
    getPendingBranchProductRequests(supabase, companyId),
    getCurrentStock(supabase),
  ]);

  const onHandByProductBranch: Record<string, number> = {};
  for (const row of stock) {
    if (!row.product_id || !row.branch_id) continue;
    const key = `${row.product_id}::${row.branch_id}`;
    onHandByProductBranch[key] = (onHandByProductBranch[key] ?? 0) + Number(row.quantity_on_hand ?? 0);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Branches</h1>
        <p className="mt-1 text-sm text-muted">
          Decide which products belong at each salon, and prepare whole series for future buys. This is a
          planning list, not a restriction — branch managers can still search for and add anything in Stock-in or
          Counts.
        </p>
      </div>
      <BranchAssignmentReport
        branches={branches.map((branch) => ({ id: branch.id, name: salonName(branch.name) }))}
        tags={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
        products={products.map((product) => ({
          id: product.id,
          sku: product.sku,
          label: productDisplayName(product) || product.sku || product.id,
          brand: product.brand,
          brandSub: product.brandSub,
          sizeLabel: product.sizeLabel,
          classificationsByBranch: product.classificationsByBranch,
          tagIds: product.tagIds,
          branchIds: product.branchIds,
        }))}
        pendingRequests={pendingRequests}
        onHandByProductBranch={onHandByProductBranch}
      />
    </div>
  );
}
