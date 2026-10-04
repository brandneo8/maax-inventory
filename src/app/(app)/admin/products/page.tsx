import { AdminProductsView } from "./products-view";

export default function AdminProductsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted">
          Every product. To work through one supplier at a time, open its price list from Suppliers.
        </p>
      </div>
      <AdminProductsView />
    </div>
  );
}
