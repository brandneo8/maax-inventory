import { requireAdmin } from "@/lib/auth";
import { getBranches, getTags } from "@/lib/data/lookups";
import { getCatalogProducts } from "@/lib/data/products";
import { getPosTagRules } from "@/lib/data/pos-rules";
import { classificationTagsLabel, salonName } from "@/lib/labels";
import { PosTable } from "./pos-table";

export default async function PosPage() {
  const { supabase, companyId } = await requireAdmin();
  const [products, branches, tags, rules] = await Promise.all([
    getCatalogProducts(supabase, companyId),
    getBranches(supabase, companyId),
    getTags(supabase, companyId),
    getPosTagRules(supabase, companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">POS allowlist</h1>
        <p className="mt-1 text-sm text-muted">
          Decide which products may appear in the POS system — a company-wide decision, driven entirely by
          the tag filter below. Everything not excluded by it is allowed.
        </p>
      </div>

      <PosTable
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          orderName: product.orderName,
          sku: product.sku,
          barcode: product.barcode,
          brand: product.brand,
          typeLabel: classificationTagsLabel([...new Set(Object.values(product.classificationsByBranch).flat())]),
          sizeLabel: product.sizeLabel,
          posAllowed: product.posAllowed,
          branchIds: product.branchIds,
          tagIds: product.tagIds,
          tagNames: product.tagNames,
        }))}
        branches={branches.map((branch) => ({ id: branch.id, label: salonName(branch.name) }))}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        rules={rules}
      />
    </div>
  );
}
