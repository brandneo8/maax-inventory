import { requireAdmin } from "@/lib/auth";
import { getBranches, getSuppliers, getTags, getTaxRates } from "@/lib/data/lookups";
import { getCatalogProducts, getProductBranchCosts } from "@/lib/data/products";
import { salonName } from "@/lib/labels";
import { ProductsTable } from "@/app/(app)/products/products-table";
import type { BrandOrderForm } from "@/lib/data/order-forms";

/**
 * The admin products table — the whole catalogue, or (with `supplierId`) one
 * supplier's price list. Both load every product, so bundles can still use
 * contents from any supplier; the price list just shows that supplier's.
 */
export async function AdminProductsView({
  supplierId = null,
  orderForms = [],
}: {
  supplierId?: string | null;
  orderForms?: BrandOrderForm[];
}) {
  const { supabase, companyId } = await requireAdmin();
  const [suppliers, branches, products, tags, taxRates, branchCosts, companyResult] =
    await Promise.all([
      getSuppliers(supabase, companyId),
      getBranches(supabase, companyId),
      getCatalogProducts(supabase, companyId),
      getTags(supabase, companyId),
      getTaxRates(supabase, companyId),
      getProductBranchCosts(supabase, companyId),
      supabase
        .from("companies")
        .select("catalog_saved_at, catalog_saved_by_email")
        .eq("id", companyId)
        .maybeSingle(),
    ]);
  if (companyResult.error) throw companyResult.error;

  return (
    <ProductsTable
      lockedSupplierId={supplierId}
      orderForms={orderForms}
      catalogSavedAt={companyResult.data?.catalog_saved_at ?? null}
      catalogSavedByEmail={companyResult.data?.catalog_saved_by_email ?? null}
      tags={tags}
      branches={branches.map((branch) => ({ id: branch.id, name: salonName(branch.name) }))}
      gstRate={Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9)}
      branchCosts={branchCosts}
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
        classificationsByBranch: product.classificationsByBranch,
        unitCost: product.unitCost,
        rrp: product.rrp,
        threshold: product.threshold,
        tagIds: product.tagIds,
        tagNames: product.tagNames,
        sizeLabel: product.sizeLabel,
        sizeMl: product.sizeMl,
        isSet: product.isSet,
        pictureUrl: product.pictureUrl,
        branchIds: product.branchIds,
        supplierIds: product.supplierIds,
        supplierName: product.supplierName,
        gstRegistered: product.gstRegistered,
        components: product.components,
      }))}
    />
  );
}
