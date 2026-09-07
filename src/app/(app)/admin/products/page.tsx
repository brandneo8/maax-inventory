import { requireAdmin } from "@/lib/auth";
import { getBranches, getSuppliers, getTags, getTaxRates } from "@/lib/data/lookups";
import { getCatalogProducts } from "@/lib/data/products";
import { salonName } from "@/lib/labels";
import { ProductsTable } from "@/app/(app)/products/products-table";

export default async function AdminProductsPage() {
  const { supabase, companyId } = await requireAdmin();
  const [suppliers, branches, products, tags, taxRates] = await Promise.all([
    getSuppliers(supabase, companyId),
    getBranches(supabase, companyId),
    getCatalogProducts(supabase, companyId),
    getTags(supabase, companyId),
    getTaxRates(supabase, companyId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted">
          Company catalog. Add min and/or kin so a SKU appears on that salon&apos;s Products page.
          Bundle means this SKU is a kit; choose its contents so receiving unpacks those products.
          Child unit cost is inherited from the bundle: one SKU is divided by quantity, mixed kits need a cost split.
          Add a blank row at the top of the table, fill in an order name, then Save products.
          Name is an optional short label for staff. Filter by min or kin to see that salon&apos;s list.
          Choose a supplier on each row so tax uses that supplier&apos;s GST status.
        </p>
      </div>
      <ProductsTable
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
