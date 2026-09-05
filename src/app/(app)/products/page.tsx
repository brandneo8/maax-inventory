import { requireUser } from "@/lib/auth";
import { getProducts } from "@/lib/data/lookups";
import { formatMoney, formatQty } from "@/lib/format";
import { CLASSIFICATIONS, classificationLabel } from "@/lib/labels";
import { btnClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { createProduct } from "./actions";

export default async function ProductsPage() {
  const { supabase, companyId } = await requireUser();
  const products = await getProducts(supabase, companyId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="mt-1 text-sm text-muted">
          Catalog only. Quantity is not stored here — it is derived from receipts and other ledger
          entries.
        </p>
      </div>

      <form action={createProduct} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-sm font-semibold">Add product</h2>
        <label className="space-y-1 text-sm">
          <span>SKU</span>
          <input className={fieldClass} name="sku" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Name</span>
          <input className={fieldClass} name="name" required />
        </label>
        <label className="space-y-1 text-sm">
          <span>Brand</span>
          <input className={fieldClass} name="brand" placeholder="Optional — creates the brand if new" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Default type</span>
          <select className={fieldClass} name="classification" defaultValue="">
            <option value="">None</option>
            {CLASSIFICATIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Unit cost</span>
          <input className={fieldClass} name="unit_cost_price" type="number" min="0" step="0.01" defaultValue="0" />
        </label>
        <label className="space-y-1 text-sm">
          <span>RRP</span>
          <input className={fieldClass} name="rrp" type="number" min="0" step="0.01" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Low stock threshold</span>
          <input className={fieldClass} name="low_stock_threshold" type="number" min="0" step="0.01" />
        </label>
        <div className="md:col-span-2">
          <button className={btnClass} type="submit">
            Save product
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>SKU</th>
              <th className={thClass}>Name</th>
              <th className={thClass}>Brand</th>
              <th className={thClass}>Default type</th>
              <th className={thClass}>Cost</th>
              <th className={thClass}>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={6}>
                  No products yet.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const brand = Array.isArray(product.brands) ? product.brands[0] : product.brands;
                return (
                  <tr key={product.id}>
                    <td className={tdClass}>{product.sku}</td>
                    <td className={tdClass}>{product.name}</td>
                    <td className={tdClass}>{brand?.name ?? "—"}</td>
                    <td className={tdClass}>{classificationLabel(product.default_classification)}</td>
                    <td className={tdClass}>{formatMoney(product.unit_cost_price)}</td>
                    <td className={tdClass}>{formatQty(product.low_stock_threshold)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
