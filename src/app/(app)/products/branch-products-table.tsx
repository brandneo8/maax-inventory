"use client";

import { useMemo, useState } from "react";
import { classificationLabel } from "@/lib/labels";
import { parseSize, sizesMatch } from "@/lib/product-size";
import { btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatQty, formatSku, productDisplayName } from "@/lib/format";
import { searchFieldsMatch } from "@/lib/search";
import type { CatalogProduct } from "@/lib/data/products";
import { cn } from "@/lib/utils";

type SalonProduct = CatalogProduct & { onHand: number };

function groupKey(product: SalonProduct) {
  return product.brandSub.trim() || "No Brand_sub";
}

export function BranchProductsTable({
  products,
}: {
  products: SalonProduct[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sizeQuery, setSizeQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [brandSubFilter, setBrandSubFilter] = useState("");
  const [groupByBrandSub, setGroupByBrandSub] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [bundleProduct, setBundleProduct] = useState<SalonProduct | null>(null);

  const parsedFilter = useMemo(() => parseSize(sizeQuery), [sizeQuery]);
  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brand.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [products],
  );
  const brandSubs = useMemo(
    () =>
      [...new Set(products.map((product) => product.brandSub.trim()).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [products],
  );

  const visible = useMemo(() => {
    return products.filter((product) => {
      if (!searchFieldsMatch([product.name, product.orderName, product.brand], searchQuery)) {
        return false;
      }
      if (brandFilter && product.brand !== brandFilter) return false;
      if (brandSubFilter === "none" && product.brandSub.trim()) return false;
      if (brandSubFilter && brandSubFilter !== "none" && product.brandSub.trim() !== brandSubFilter) return false;
      if (!sizeQuery.trim()) return true;
      if (parsedFilter) {
        return sizesMatch(product.sizeMl, parsedFilter.ml);
      }
      const label = product.sizeLabel?.toLowerCase() ?? "";
      return label.includes(sizeQuery.trim().toLowerCase());
    });
  }, [brandFilter, brandSubFilter, parsedFilter, products, searchQuery, sizeQuery]);

  const grouped = useMemo(() => {
    if (!groupByBrandSub) return [{ key: "", products: visible }];
    const buckets = new Map<string, typeof visible>();
    for (const product of visible) {
      const key = groupKey(product);
      const list = buckets.get(key) ?? [];
      list.push(product);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort(([left], [right]) => {
        if (left === "No Brand_sub") return 1;
        if (right === "No Brand_sub") return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      })
      .map(([key, items]) => ({
        key,
        products: items.slice().sort((left, right) =>
          (left.orderName || left.name).localeCompare(right.orderName || right.name, undefined, { sensitivity: "base" }),
        ),
      }));
  }, [groupByBrandSub, visible]);

  const sizeHints = useMemo(() => {
    const seen = new Map<number, string>();
    for (const product of products) {
      if (product.sizeMl == null || !product.sizeLabel || seen.has(product.sizeMl)) continue;
      seen.set(product.sizeMl, product.sizeLabel);
    }
    return [...seen.entries()].sort((left, right) => left[0] - right[0]);
  }, [products]);

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columnCount = 9;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="min-w-64 flex-1 space-y-1 text-sm">
          <span>Search</span>
          <input
            className={fieldClass}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Name, order name, or brand"
          />
        </label>
        <label className="min-w-48 space-y-1 text-sm">
          <span>Brand</span>
          <select
            className={fieldClass}
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 space-y-1 text-sm">
          <span>Brand_sub</span>
          <select
            className={fieldClass}
            value={brandSubFilter}
            onChange={(event) => setBrandSubFilter(event.target.value)}
          >
            <option value="">All product lines</option>
            <option value="none">No Brand_sub</option>
            {brandSubs.map((brandSub) => (
              <option key={brandSub} value={brandSub}>
                {brandSub}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={groupByBrandSub}
            onChange={(event) => setGroupByBrandSub(event.target.checked)}
          />
          <span>Group by Brand_sub</span>
        </label>
        <label className="min-w-56 flex-1 space-y-1 text-sm">
          <span>Filter by size</span>
          <input
            className={fieldClass}
            value={sizeQuery}
            onChange={(event) => setSizeQuery(event.target.value)}
            placeholder="175ml, 1L, 175g"
          />
        </label>
        {sizeHints.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sizeHints.map(([ml, label]) => (
              <button
                key={ml}
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => setSizeQuery(label)}
              >
                {label}
              </button>
            ))}
            {sizeQuery ? (
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => setSizeQuery("")}
              >
                All sizes
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="basis-full text-xs text-muted">
          Group by Brand_sub to inspect a product line. 175ml, 175ML, and 175 ml match. 1L matches 1000ml.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>SKU</th>
              <th className={thClass}>Barcode</th>
              <th className={thClass}>Order name</th>
              <th className={thClass}>Name</th>
              <th className={thClass}>Brand_sub</th>
              <th className={thClass}>Size</th>
              <th className={thClass}>Kind</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>On hand</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={columnCount}>
                  {products.length === 0
                    ? "No products at this salon yet. They appear here after admin assigns them to this branch."
                    : "No products match that filter."}
                </td>
              </tr>
            ) : (
              grouped.flatMap((group) => {
                const rows = [];
                if (groupByBrandSub && group.key) {
                  const isCollapsed = collapsed.has(group.key);
                  rows.push(
                    <tr key={`group-${group.key}`} className="bg-slate-100">
                      <td className={cn(tdClass, "font-semibold")} colSpan={columnCount}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-left"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={!isCollapsed}
                        >
                          <span aria-hidden="true">{isCollapsed ? "+" : "−"}</span>
                          {group.key} · {group.products.length} product{group.products.length === 1 ? "" : "s"}
                        </button>
                      </td>
                    </tr>,
                  );
                  if (isCollapsed) return rows;
                }
                for (const product of group.products) {
                  rows.push(
                    <tr key={product.id}>
                      <td className={tdClass}>{formatSku(product.sku)}</td>
                      <td className={tdClass}>{formatSku(product.barcode)}</td>
                      <td className={tdClass}>
                        {product.orderName || "—"}
                        {product.brand ? <span className="block text-xs text-muted">{product.brand}</span> : null}
                      </td>
                      <td className={tdClass}>{product.name || "—"}</td>
                      <td className={tdClass}>{product.brandSub || "—"}</td>
                      <td className={tdClass}>{product.sizeLabel || "—"}</td>
                      <td className={tdClass}>
                        {product.isSet ? (
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => setBundleProduct(product)}
                          >
                            Bundle
                          </button>
                        ) : (
                          "Single"
                        )}
                      </td>
                      <td className={tdClass}>{classificationLabel(product.defaultClassification)}</td>
                      <td className={tdClass}>{formatQty(product.onHand)}</td>
                    </tr>,
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>

      {bundleProduct ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setBundleProduct(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-white p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Bundle contents</h3>
                <p className="text-sm text-muted">
                  {productDisplayName(bundleProduct) || bundleProduct.orderName || "Untitled bundle"}
                </p>
              </div>
              <button className={btnSecondaryClass} type="button" onClick={() => setBundleProduct(null)}>
                Close
              </button>
            </div>
            {bundleProduct.components.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No products are listed in this bundle yet.</p>
            ) : (
              <table className={cn(tableClass, "mt-4")}>
                <thead>
                  <tr>
                    <th className={thClass}>Product</th>
                    <th className={thClass}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {bundleProduct.components.map((component) => (
                    <tr key={component.productId}>
                      <td className={tdClass}>{component.label}</td>
                      <td className={tdClass}>{formatQty(component.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
