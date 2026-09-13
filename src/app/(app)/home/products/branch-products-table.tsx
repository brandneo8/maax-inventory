"use client";

import { useMemo, useState } from "react";
import { CLASSIFICATIONS, classificationLabel, isAvailableInTunai, type ProductClassification } from "@/lib/labels";
import { confirmedRetailPrice } from "@/lib/catalog-pricing";
import { parseSize, sizesMatch } from "@/lib/product-size";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatMoney, formatQty, formatSku, productDisplayName } from "@/lib/format";
import { searchFieldsMatch } from "@/lib/search";
import type { CatalogProduct } from "@/lib/data/products";
import { cn } from "@/lib/utils";
import { bulkUpdateBranchProductClassifications, updateBranchProductClassifications } from "./actions";

type SalonProduct = CatalogProduct & { onHand: number; classifications: ProductClassification[] };
type GroupBy = "none" | "brand" | "brandSub";

const EDITABLE_CLASSIFICATIONS = CLASSIFICATIONS.filter((item) => item.value !== "retail_inhouse");

function groupKey(product: SalonProduct, groupBy: Exclude<GroupBy, "none">) {
  if (groupBy === "brand") return product.brand.trim() || "No Brand";
  return product.brandSub.trim() || "No Brand_sub";
}

function matchClassification(raw: string) {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  return (
    EDITABLE_CLASSIFICATIONS.find(
      (item) => item.label.toLowerCase() === needle || item.value.toLowerCase() === needle,
    ) ?? null
  );
}

function TypeCell({
  productId,
  classifications,
  onSaved,
}: {
  productId: string;
  classifications: ProductClassification[];
  onSaved: (next: ProductClassification[]) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const datalistId = `type-options-${productId}`;

  async function save(next: ProductClassification[]) {
    setPending(true);
    setError(null);
    try {
      await updateBranchProductClassifications(productId, next);
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  function addFromInput() {
    const match = matchClassification(inputValue);
    if (!match) return;
    setInputValue("");
    if (classifications.includes(match.value)) return;
    void save([...classifications, match.value]);
  }

  function removeTag(value: ProductClassification) {
    void save(classifications.filter((item) => item !== value));
  }

  const remainingOptions = EDITABLE_CLASSIFICATIONS.filter((item) => !classifications.includes(item.value));

  return (
    <div className="flex min-w-32 flex-col gap-1">
      {classifications.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {classifications.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs"
            >
              {classificationLabel(value)}
              <button
                type="button"
                className="text-muted hover:text-slate-900"
                disabled={pending}
                onClick={() => removeTag(value)}
                aria-label={`Remove ${classificationLabel(value)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {remainingOptions.length > 0 ? (
        <>
          <input
            list={datalistId}
            className="w-full rounded border border-border px-1.5 py-0.5 text-xs"
            placeholder="Type to add…"
            value={inputValue}
            disabled={pending}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addFromInput();
              }
            }}
            onBlur={addFromInput}
          />
          <datalist id={datalistId}>
            {remainingOptions.map((item) => (
              <option key={item.value} value={item.label} />
            ))}
          </datalist>
        </>
      ) : null}
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}

function BulkTypeModal({
  count,
  onClose,
  onApply,
}: {
  count: number;
  onClose: () => void;
  onApply: (classifications: ProductClassification[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ProductClassification[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: ProductClassification) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function apply() {
    setPending(true);
    setError(null);
    try {
      await onApply(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update products.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-white p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-base font-semibold">Set type for {count} product{count === 1 ? "" : "s"}</h3>
        <p className="mt-1 text-sm text-muted">
          This replaces the type tags on the selected products for this salon.
        </p>
        <div className="mt-3 space-y-2">
          {EDITABLE_CLASSIFICATIONS.map((item) => (
            <label key={item.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={selected.includes(item.value)}
                onChange={() => toggle(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnSecondaryClass} type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btnClass} type="button" onClick={() => void apply()} disabled={pending}>
            {pending ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
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
  const [typeFilter, setTypeFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("brandSub");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [bundleProduct, setBundleProduct] = useState<SalonProduct | null>(null);
  const [prevProducts, setPrevProducts] = useState(products);
  const [localProducts, setLocalProducts] = useState(products);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  if (products !== prevProducts) {
    setPrevProducts(products);
    setLocalProducts(products);
  }

  function updateLocalClassifications(productId: string, next: ProductClassification[]) {
    setLocalProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, classifications: next } : product)),
    );
  }

  function updateLocalClassificationsMany(productIds: string[], next: ProductClassification[]) {
    const ids = new Set(productIds);
    setLocalProducts((current) =>
      current.map((product) => (ids.has(product.id) ? { ...product, classifications: next } : product)),
    );
  }

  function toggleSelected(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function applyBulkClassifications(classifications: ProductClassification[]) {
    const productIds = [...selected];
    await bulkUpdateBranchProductClassifications(productIds, classifications);
    updateLocalClassificationsMany(productIds, classifications);
    setSelected([]);
    setBulkOpen(false);
  }

  const parsedFilter = useMemo(() => parseSize(sizeQuery), [sizeQuery]);
  const brands = useMemo(
    () => [...new Set(localProducts.map((product) => product.brand.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [localProducts],
  );
  const brandSubs = useMemo(
    () =>
      [...new Set(localProducts.map((product) => product.brandSub.trim()).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [localProducts],
  );

  const visible = useMemo(() => {
    return localProducts.filter((product) => {
      if (!searchFieldsMatch([product.name, product.orderName, product.brand], searchQuery)) {
        return false;
      }
      if (brandFilter && product.brand !== brandFilter) return false;
      if (brandSubFilter === "none" && product.brandSub.trim()) return false;
      if (brandSubFilter && brandSubFilter !== "none" && product.brandSub.trim() !== brandSubFilter) return false;
      if (typeFilter && !product.classifications.includes(typeFilter as ProductClassification)) return false;
      if (!sizeQuery.trim()) return true;
      if (parsedFilter) {
        return sizesMatch(product.sizeMl, parsedFilter.ml);
      }
      const label = product.sizeLabel?.toLowerCase() ?? "";
      return label.includes(sizeQuery.trim().toLowerCase());
    });
  }, [brandFilter, brandSubFilter, localProducts, parsedFilter, searchQuery, sizeQuery, typeFilter]);

  const selectableIds = useMemo(() => visible.map((product) => product.id), [visible]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  function toggleAll() {
    setSelected(allSelected ? [] : [...selectableIds]);
  }

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "", products: visible }];
    const buckets = new Map<string, typeof visible>();
    for (const product of visible) {
      const key = groupKey(product, groupBy);
      const list = buckets.get(key) ?? [];
      list.push(product);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort(([left], [right]) => {
        if (left.startsWith("No ")) return 1;
        if (right.startsWith("No ")) return -1;
        return left.localeCompare(right, undefined, { sensitivity: "base" });
      })
      .map(([key, items]) => ({
        key,
        products: items.slice().sort((left, right) =>
          (left.orderName || left.name).localeCompare(right.orderName || right.name, undefined, { sensitivity: "base" }),
        ),
      }));
  }, [groupBy, visible]);

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columnCount = 13;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {selected.length > 0
            ? `${selected.length} product${selected.length === 1 ? "" : "s"} selected.`
            : "Select rows to bulk-tag their type."}
        </p>
        <button
          className={btnSecondaryClass}
          type="button"
          disabled={selected.length === 0}
          onClick={() => setBulkOpen(true)}
        >
          Bulk tag type
        </button>
      </div>
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
        <label className="min-w-40 space-y-1 text-sm">
          <span>Group by</span>
          <select
            className={fieldClass}
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
          >
            <option value="none">None</option>
            <option value="brand">Brand</option>
            <option value="brandSub">Brand_sub</option>
          </select>
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
        <div className="flex basis-full flex-wrap gap-2">
          {EDITABLE_CLASSIFICATIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50",
                typeFilter === item.value ? "border-sky-400 bg-sky-100 font-medium" : "border-border",
              )}
              onClick={() => setTypeFilter((current) => (current === item.value ? "" : item.value))}
            >
              {item.label}
            </button>
          ))}
          {typeFilter ? (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => setTypeFilter("")}
            >
              All types
            </button>
          ) : null}
        </div>
        {typeFilter ? (
          <p className="basis-full text-xs text-sky-800">
            Showing all {visible.length} {CLASSIFICATIONS.find((item) => item.value === typeFilter)?.label}{" "}
            product{visible.length === 1 ? "" : "s"}.
          </p>
        ) : null}
        <p className="basis-full text-xs text-muted">
          Group by Brand or Brand_sub to inspect a product line. 175ml, 175ML, and 175 ml match. 1L matches 1000ml.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all products"
                />
              </th>
              <th className={thClass}>Image</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Available in Tunai</th>
              <th className={thClass}>SKU</th>
              <th className={thClass}>Barcode</th>
              <th className={thClass}>Name</th>
              <th className={thClass}>Brand_sub</th>
              <th className={thClass}>Size</th>
              <th className={thClass}>Kind</th>
              <th className={thClass}>On hand</th>
              <th className={thClass}>RRP</th>
              <th className={thClass}>CRP</th>
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
                if (groupBy !== "none" && group.key) {
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
                      <td className={tdClass}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected.includes(product.id)}
                          onChange={() => toggleSelected(product.id)}
                          aria-label={`Select ${product.orderName || product.name || "product"}`}
                        />
                      </td>
                      <td className={tdClass}>
                        {product.pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.pictureUrl}
                            alt=""
                            className="h-10 w-10 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md border border-border bg-slate-50" />
                        )}
                      </td>
                      <td className={tdClass}>
                        <TypeCell
                          productId={product.id}
                          classifications={product.classifications}
                          onSaved={(next) => updateLocalClassifications(product.id, next)}
                        />
                      </td>
                      <td className={tdClass}>{isAvailableInTunai(product.classifications) ? "Yes" : "No"}</td>
                      <td className={tdClass}>{formatSku(product.sku)}</td>
                      <td className={tdClass}>{formatSku(product.barcode)}</td>
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
                      <td className={tdClass}>{formatQty(product.onHand)}</td>
                      <td className={tdClass}>{product.rrp == null ? "—" : formatMoney(product.rrp)}</td>
                      <td className={tdClass}>
                        {formatMoney(confirmedRetailPrice(product.unitCost, product.rrp))}
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })
            )}
          </tbody>
        </table>
      </div>

      {bulkOpen ? (
        <BulkTypeModal
          count={selected.length}
          onClose={() => setBulkOpen(false)}
          onApply={applyBulkClassifications}
        />
      ) : null}

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
