"use client";

import { Fragment, useMemo, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import type { OrderBalanceProduct } from "@/lib/data/products";
import { savePlanningOrders } from "./actions";
import { catalogTax } from "@/lib/catalog-pricing";
import { computeOrderTotals } from "../stock-in/order-totals-calc";
import { productDisplayName } from "@/lib/format";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { blurOnWheel, btnClass, btnSecondaryClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatMoney, formatQty } from "@/lib/format";
import { searchFieldsMatch } from "@/lib/search";
import { cn } from "@/lib/utils";

type SupplierOption = { id: string; label: string; gstRegistered: boolean };

type DraftLine = {
  productId: string;
  quantity: number;
  unitCost: number;
};

const CLASSIFICATION_PRIORITY: ProductClassification[] = ["retail", "gwp", "inhouse"];
const NO_BRAND_SUB_LABEL = "No sub-brand";

function tagSortKey(product: OrderBalanceProduct) {
  return [...product.tagNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).join(", ");
}

function defaultClassification(classifications: ProductClassification[]): ProductClassification {
  for (const candidate of CLASSIFICATION_PRIORITY) {
    if (classifications.includes(candidate)) return candidate;
  }
  return classifications[0] ?? "retail";
}

export function InventoryBalancePane({
  branchId,
  products,
  suppliers,
  gstRate,
  onSaved,
}: {
  branchId: string;
  products: OrderBalanceProduct[];
  suppliers: SupplierOption[];
  gstRate: number;
  /** Called with the new draft's number once it's saved. */
  onSaved: (poNumbers: string[]) => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<ProductClassification | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const gstRegistered = suppliers.find((supplier) => supplier.id === supplierId)?.gstRegistered ?? false;

  // The brands this supplier provides, from the products linked to it — a
  // guide on the right, and the choices in the Brand filter (every brand if
  // no supplier is chosen or it has no products linked yet).
  const supplierBrands = useMemo(() => {
    if (!supplierId) return [];
    const linked = products.filter((product) => product.supplierIds.includes(supplierId));
    return [...new Set(linked.map((product) => product.brand.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [products, supplierId]);
  const brandOptions = useMemo(
    () =>
      supplierBrands.length > 0
        ? supplierBrands
        : [...new Set(products.map((product) => product.brand.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products, supplierBrands],
  );
  const tagOptions = useMemo(
    () => [...new Set(products.flatMap((product) => product.tagNames))].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const typeOptions = useMemo(
    () => CLASSIFICATIONS.filter((item) => products.some((product) => product.classifications.includes(item.value))),
    [products],
  );

  function changeSupplier(next: string) {
    setSupplierId(next);
    // A brand the new supplier doesn't carry would silently hide every row.
    setBrandFilter("");
  }

  const pickableForSupplier = useMemo(() => {
    if (!supplierId) return products;
    return products.filter((product) => product.supplierIds.length === 0 || product.supplierIds.includes(supplierId));
  }, [products, supplierId]);

  const visibleProducts = useMemo(() => {
    return pickableForSupplier.filter((product) => {
      if (brandFilter && product.brand.trim() !== brandFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.some((tag) => product.tagNames.includes(tag))) return false;
      if (typeFilter && !product.classifications.includes(typeFilter)) return false;
      if (search.trim() && !searchFieldsMatch([product.name, product.orderName, product.sku, product.barcode], search)) {
        return false;
      }
      return true;
    });
  }, [pickableForSupplier, brandFilter, tagFilter, typeFilter, search]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, OrderBalanceProduct[]>();
    for (const product of visibleProducts) {
      const key = product.brandSub || NO_BRAND_SUB_LABEL;
      const bucket = groups.get(key);
      if (bucket) bucket.push(product);
      else groups.set(key, [product]);
    }
    const sortedGroups = [...groups.entries()].sort(([left], [right]) => {
      if (left === NO_BRAND_SUB_LABEL) return 1;
      if (right === NO_BRAND_SUB_LABEL) return -1;
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });
    return sortedGroups.map(([brandSub, items]) => ({
      brandSub,
      products: [...items].sort(
        (a, b) =>
          tagSortKey(a).localeCompare(tagSortKey(b), undefined, { sensitivity: "base" }) ||
          (productDisplayName(a) || a.sku || "").localeCompare(productDisplayName(b) || b.sku || "", undefined, {
            sensitivity: "base",
          }),
      ),
    }));
  }, [visibleProducts]);

  const addedIds = useMemo(() => new Set(lines.map((line) => line.productId)), [lines]);

  function addProduct(product: OrderBalanceProduct) {
    if (addedIds.has(product.id)) return;
    setLines((current) => [...current, { productId: product.id, quantity: 1, unitCost: product.unitCost }]);
  }

  function updateLine(productId: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  const displayLines = lines.map((line) => {
    const product = productById.get(line.productId);
    return {
      ...line,
      label: product ? productDisplayName(product) || product.sku || product.id : line.productId,
      onHand: product?.onHand ?? 0,
      monthToDateUse: product?.monthToDateUse ?? 0,
      monthlyUse: product?.monthlyUse ?? 0,
      isBundle: product?.isBundle ?? false,
      classifications: product?.classifications ?? [],
    };
  });

  const orderableLines = displayLines.filter((line) => line.quantity > 0);
  const canSave = Boolean(supplierId) && Boolean(requestedBy.trim()) && orderableLines.length > 0 && !pending;

  const { subtotal, grandTotal } = computeOrderTotals(
    orderableLines.map((line) => ({ quantity_ordered: line.quantity, unit_price: line.unitCost })),
    gstRegistered,
    gstRate,
  );

  async function saveOrder() {
    setPending(true);
    setError(null);
    try {
      const saved = await savePlanningOrders({
        branchId,
        requestedBy,
        orderDate: today,
        groups: [
          {
            supplierId,
            lines: orderableLines.map((line) => ({
              product_id: line.productId,
              classification: defaultClassification(line.classifications),
              quantity_ordered: line.quantity,
              unit_price: line.unitCost,
            })),
          },
        ],
      });
      setLines([]);
      setPending(false);
      onSaved(saved.map((row) => row.poNumber));
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not save the order.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section className="space-y-3 lg:col-span-3">
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-1">
            <span>Search</span>
            <input
              className={fieldClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, SKU, or barcode"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Brand</span>
            <select className={fieldClass} value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="">All brands</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Type</span>
            <select
              className={fieldClass}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ProductClassification | "")}
            >
              <option value="">All types</option>
              {typeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tagOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="text-sm text-muted">Tag (any selected):</span>
            {tagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50",
                  tagFilter.includes(tag) ? "border-sky-400 bg-sky-100 font-medium" : "border-border",
                )}
                onClick={() =>
                  setTagFilter((current) =>
                    current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
                  )
                }
              >
                {tag}
              </button>
            ))}
            {tagFilter.length > 0 ? (
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => setTagFilter([])}
              >
                All tags
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-[80vh] overflow-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Brand</th>
                <th className={thClass}>Brand sub</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Tag</th>
                <th className={thClass}>On hand</th>
                <th className={thClass}>MTD use</th>
                <th className={thClass}>Monthly use</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {groupedProducts.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={9}>
                    No products match that filter.
                  </td>
                </tr>
              ) : (
                groupedProducts.map((group) => (
                  <Fragment key={group.brandSub}>
                    <tr className="border-t-2 border-sky-300 bg-sky-100 text-sky-950">
                      <td className={cn(tdClass, "text-sm font-bold uppercase tracking-wide")} colSpan={9}>
                        {group.brandSub}
                        <span className="ml-2 text-xs font-medium normal-case tracking-normal text-sky-800">
                          {group.products.length} {group.products.length === 1 ? "product" : "products"}
                        </span>
                      </td>
                    </tr>
                    {group.products.map((product) => {
                      const added = addedIds.has(product.id);
                      return (
                        <tr
                          key={`${group.brandSub}-${product.id}`}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => addProduct(product)}
                        >
                          <td className={tdClass}>{productDisplayName(product) || product.sku || "—"}</td>
                          <td className={tdClass}>{product.brand || "—"}</td>
                          <td className={tdClass}>{product.brandSub || "—"}</td>
                          <td className={tdClass}>
                            {product.classifications.map((value) => CLASSIFICATIONS.find((item) => item.value === value)?.label ?? value).join(", ") || "—"}
                          </td>
                          <td className={tdClass}>{product.tagNames.join(", ") || "—"}</td>
                          <td className={tdClass}>{formatQty(product.onHand)}</td>
                          <td className={tdClass}>{product.isBundle ? "—" : formatQty(product.monthToDateUse)}</td>
                          <td className={tdClass}>{product.isBundle ? "—" : formatQty(product.monthlyUse)}</td>
                          <td className={tdClass}>
                            <button
                              type="button"
                              className={cn(btnSecondaryClass, "px-2 py-1 text-xs")}
                              disabled={added}
                              onClick={(event) => {
                                event.stopPropagation();
                                addProduct(product);
                              }}
                            >
                              {added ? "Added" : "Add"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 lg:col-span-2">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <label className="block space-y-1 text-sm">
            <span>Supplier</span>
            <select
              id="order-supplier"
              className={fieldClass}
              value={supplierId}
              onChange={(event) => changeSupplier(event.target.value)}
            >
              <option value="" disabled>
                Select supplier
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </select>
          </label>

          {supplierId ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">Brands from this supplier</p>
              {supplierBrands.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {supplierBrands.map((brand) => (
                    <span
                      key={brand}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-900"
                    >
                      {brand}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted">No products are linked to this supplier yet.</p>
              )}
            </div>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span>Requested by</span>
            <input
              id="order-requested-by"
              className={fieldClass}
              value={requestedBy}
              onChange={(event) => setRequestedBy(event.target.value)}
              placeholder="Who is asking for these products"
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Cost incl. tax</th>
                <th className={thClass}>On hand</th>
                <th className={thClass}>MTD use</th>
                <th className={thClass}>Monthly use</th>
                <th className={thClass}>Qty to order</th>
                <th className={thClass}>Total</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {displayLines.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={8}>
                    Click a product on the left to add it here.
                  </td>
                </tr>
              ) : (
                displayLines.map((line) => {
                  const unitCostWithTax = catalogTax(line.unitCost, gstRegistered, gstRate).unitCostWithTax;
                  return (
                    <tr key={line.productId}>
                      <td className={tdClass}>{line.label}</td>
                      <td className={tdClass}>
                        <input
                          className={cn(fieldClass, numberFieldClass, "w-24")}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitCost === 0 ? "" : line.unitCost}
                          onWheel={blurOnWheel}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            updateLine(line.productId, { unitCost: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
                          }}
                        />
                        <span className="ml-1 text-xs text-muted">({formatMoney(unitCostWithTax)})</span>
                      </td>
                      <td className={tdClass}>{formatQty(line.onHand)}</td>
                      <td className={tdClass}>{line.isBundle ? "—" : formatQty(line.monthToDateUse)}</td>
                      <td className={tdClass}>{line.isBundle ? "—" : formatQty(line.monthlyUse)}</td>
                      <td className={tdClass}>
                        <input
                          className={cn(fieldClass, numberFieldClass, "w-20")}
                          type="number"
                          min="0"
                          step="1"
                          value={line.quantity === 0 ? "" : line.quantity}
                          onWheel={blurOnWheel}
                          onChange={(event) => {
                            const raw = event.target.value;
                            if (raw === "") {
                              updateLine(line.productId, { quantity: 0 });
                              return;
                            }
                            const parsed = Math.round(Number(raw));
                            if (Number.isFinite(parsed)) updateLine(line.productId, { quantity: Math.max(0, parsed) });
                          }}
                        />
                      </td>
                      <td className={tdClass}>{formatMoney(line.quantity * unitCostWithTax)}</td>
                      <td className={tdClass}>
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => removeLine(line.productId)}
                          aria-label={`Remove ${line.label}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {displayLines.length > 0 ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm">
            <span className="text-muted">Subtotal {formatMoney(subtotal)}</span>
            <span className="font-medium">Total {formatMoney(grandTotal)}</span>
          </div>
        ) : null}

        <button className={btnClass} type="button" disabled={!canSave} onClick={() => void saveOrder()}>
          {pending ? "Saving…" : "Save order"}
        </button>
        {!supplierId || !requestedBy.trim() ? (
          <p className="text-xs text-muted">
            {!supplierId ? "Select a supplier" : "Enter who is requesting the products"} before saving.
          </p>
        ) : null}
      </section>
    </div>
  );
}
