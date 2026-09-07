import { requireAdmin } from "@/lib/auth";
import { getSuppliers, getTaxRates } from "@/lib/data/lookups";
import { SuppliersTable } from "../suppliers-table";

export default async function AdminSuppliersPage() {
  const { supabase, companyId } = await requireAdmin();
  const [suppliers, taxRates] = await Promise.all([
    getSuppliers(supabase, companyId),
    getTaxRates(supabase, companyId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 text-sm text-muted">
          Maintain supplier contacts, order channel, and GST. Ticking GST saves immediately.
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
        }))}
        taxRate={Number(taxRates.find((rate) => rate.is_default)?.rate_percentage ?? 9)}
      />
    </div>
  );
}
