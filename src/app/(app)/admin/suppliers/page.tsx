import { requireAdmin } from "@/lib/auth";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { getOrderFormMatchCounts } from "@/lib/data/order-forms";
import { SuppliersTable } from "../suppliers-table";

export default async function AdminSuppliersPage() {
  const { supabase, companyId } = await requireAdmin();
  const [suppliers, taxRates, matchedCounts] = await Promise.all([
    getSuppliers(supabase, companyId),
    getTaxRates(supabase, companyId),
    getOrderFormMatchCounts(supabase, companyId),
  ]);

  // How many products each supplier's price list holds.
  const productCounts: Record<string, number> = {};
  const supplierIds = suppliers.map((supplier) => supplier.id);
  for (let from = 0; supplierIds.length > 0; from += 1000) {
    const { data, error } = await supabase
      .from("supplier_products")
      .select("supplier_id, product_id")
      .in("supplier_id", supplierIds)
      .order("product_id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) productCounts[row.supplier_id] = (productCounts[row.supplier_id] ?? 0) + 1;
    if (!data || data.length < 1000) break;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 text-sm text-muted">
          Maintain supplier contacts, order channel, and GST — click Edit to change them, or Add supplier. Open a supplier&apos;s
          price list to edit just its products.
        </p>
      </div>
      <SuppliersTable
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          supplier_name: supplier.supplier_name,
          poc_name: supplier.poc_name ?? "",
          poc_number: supplier.poc_number ?? "",
          order_channel: supplier.order_channel ?? "",
          gst_registered: supplier.gst_registered,
          is_active: supplier.is_active,
        }))}
        taxRate={Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9)}
        productCounts={productCounts}
        matchedCounts={matchedCounts}
      />
    </div>
  );
}
