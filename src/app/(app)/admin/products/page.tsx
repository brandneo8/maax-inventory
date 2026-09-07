import { requireAdmin } from "@/lib/auth";
import { getBranches, getSuppliers, getTags, getTaxRates } from "@/lib/data/lookups";
import { getCatalogProducts } from "@/lib/data/products";
import { salonName } from "@/lib/labels";
import { ProductsTable } from "@/app/(app)/products/products-table";

export default async function AdminProductsPage() {
  const { supabase, companyId } = await requireAdmin();
  const [suppliers, branches, products, tags, taxRates, companyResult] = await Promise.all([
    getSuppliers(supabase, companyId),
    getBranches(supabase, companyId),
    getCatalogProducts(supabase, companyId),
    getTags(supabase, companyId),
    getTaxRates(supabase, companyId),
    supabase
      .from("companies")
      .select("catalog_saved_at, catalog_saved_by_email")
      .eq("id", companyId)
      .maybeSingle(),
  ]);
  if (companyResult.error) throw companyResult.error;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
      </div>
      <ProductsTable
        catalogSavedAt={companyResult.data?.catalog_saved_at ?? null}
        catalogSavedByEmail={companyResult.data?.catalog_saved_by_email ?? null}
        tags={tags}
        branches={branches.map((branch) => ({ id: branch.id, name: salonName(branch.name) }))}
        gstRate={Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9)}
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.supplier_name,
          gstRegistered: supplier.gst_registered,
        }))}
        products={products.map((product) => ({
          id: product.id,
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          orderName: product.orderName,
          brand: product.brand,
          brandSub: product.brandSub,
          defaultClassification: product.defaultClassification,
          unitCost: product.unitCost,
          rrp: product.rrp,
          threshold: product.threshold,
          tagIds: product.tagIds,
          tagNames: product.tagNames,
          sizeLabel: product.sizeLabel,
          sizeMl: product.sizeMl,
          isSet: product.isSet,
          branchIds: product.branchIds,
          supplierIds: product.supplierIds,
          supplierName: product.supplierName,
          gstRegistered: product.gstRegistered,
          components: product.components,
        }))}
      />
    </div>
  );
}
