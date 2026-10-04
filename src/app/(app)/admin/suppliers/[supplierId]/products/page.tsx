import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSupplierBrandOrderForms } from "@/lib/data/order-forms";
import { AdminProductsView } from "../../../products/products-view";

/** One supplier's price list: the admin products table, showing only that supplier's products. */
export default async function SupplierPriceListPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  const { supabase, companyId } = await requireAdmin();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, supplier_name, gst_registered")
    .eq("company_id", companyId)
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplier) notFound();
  const orderForms = await getSupplierBrandOrderForms(supabase, companyId, supplier.id);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/suppliers" className="text-sm text-muted underline">
          ← Suppliers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{supplier.supplier_name} price list</h1>
        <p className="mt-1 text-sm text-muted">
          Products bought from {supplier.supplier_name}
          {supplier.gst_registered ? " (GST registered)" : ""}. New products added here are linked to this supplier.
          Pick a brand to see its products and its order form (one CSV or Excel file per brand).
        </p>
      </div>
      <AdminProductsView supplierId={supplier.id} orderForms={orderForms} />
    </div>
  );
}
