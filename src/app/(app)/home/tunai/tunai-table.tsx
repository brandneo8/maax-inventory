"use client";

import { useMemo, useState, type ReactNode } from "react";
import { confirmedRetailPrice } from "@/lib/catalog-pricing";
import { classificationTagsLabel, CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { formatMoney, formatQty, formatSku } from "@/lib/format";
import { parseSize, sizesMatch } from "@/lib/product-size";
import { searchTextMatches } from "@/lib/search";
import { fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/data/products";

export type TunaiProduct = CatalogProduct & { onHand: number };

type SortColumn = "type" | "brand" | "sku" | "barcode" | "name" | "size" | "onHand";
type SortDirection = "asc" | "desc";

function sortValue(product: TunaiProduct, column: SortColumn): string | number {
  switch (column) {
    case "type":
      return classificationTagsLabel(product.classifications);
    case "brand":
      return product.brand;
    case "sku":
      return product.sku ?? "";
    case "barcode":
      return product.barcode ?? "";
    case "name":
      return product.name || product.orderName;
    case "size":
      return product.sizeLabel ?? "";
    case "onHand":
      return product.onHand;
    default:
      return "";
  }
}

function compareProducts(left: TunaiProduct, right: TunaiProduct, column: SortColumn, direction: SortDirection) {
  const a = sortValue(left, column);
  const b = sortValue(right, column);
  const cmp =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  return direction === "desc" ? -cmp : cmp;
}

function SortableHeader({
  column,
  active,
  direction,
  onSort,
  children,
}: {
  column: SortColumn;
  active: boolean;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 whitespace-nowrap hover:underline"
      onClick={() => onSort(column)}
    >
      {children}
      {active ? <span aria-hidden="true">{direction === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

export function TunaiTable({
  title,
  description,
  products,
  emptyMessage,
}: {
  title: string;
  description: string;
  products: TunaiProduct[];
  emptyMessage: string;
}) {
  const [typeFilter, setTypeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [onHandFilter, setOnHandFilter] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const typeOptions = useMemo(
    () =>
      CLASSIFICATIONS.filter(
        (item) => item.value !== "retail_inhouse" && products.some((product) => product.classifications.includes(item.value)),
      ),
    [products],
  );
  const brandOptions = useMemo(
    () => [...new Set(products.map((product) => product.brand.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [products],
  );

  const parsedSizeFilter = useMemo(() => parseSize(sizeFilter), [sizeFilter]);

  const visible = useMemo(() => {
    return products.filter((product) => {
      if (typeFilter && !product.classifications.includes(typeFilter as ProductClassification)) return false;
      if (brandFilter && product.brand !== brandFilter) return false;
      if (!searchTextMatches(product.sku ?? "", skuFilter)) return false;
      if (!searchTextMatches(product.barcode ?? "", barcodeFilter)) return false;
      if (!searchTextMatches(product.name || product.orderName, nameFilter)) return false;
      if (sizeFilter.trim()) {
        if (parsedSizeFilter) {
          if (!sizesMatch(product.sizeMl, parsedSizeFilter.ml)) return false;
        } else if (!(product.sizeLabel ?? "").toLowerCase().includes(sizeFilter.trim().toLowerCase())) {
          return false;
        }
      }
      if (onHandFilter.trim() && !String(product.onHand).includes(onHandFilter.trim())) return false;
      return true;
    });
  }, [products, typeFilter, brandFilter, skuFilter, barcodeFilter, nameFilter, sizeFilter, parsedSizeFilter, onHandFilter]);

  const sorted = useMemo(
    () => [...visible].sort((left, right) => compareProducts(left, right, sortColumn, sortDirection)),
    [visible, sortColumn, sortDirection],
  );

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3 xl:grid-cols-7">
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select className={fieldClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {typeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
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
          <span>SKU</span>
          <input className={fieldClass} value={skuFilter} onChange={(event) => setSkuFilter(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Barcode</span>
          <input
            className={fieldClass}
            value={barcodeFilter}
            onChange={(event) => setBarcodeFilter(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Name</span>
          <input className={fieldClass} value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Size</span>
          <input
            className={fieldClass}
            value={sizeFilter}
            onChange={(event) => setSizeFilter(event.target.value)}
            placeholder="175ml, 1L, 175g"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>On hand</span>
          <input
            className={fieldClass}
            value={onHandFilter}
            onChange={(event) => setOnHandFilter(event.target.value)}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>
                <SortableHeader column="type" active={sortColumn === "type"} direction={sortDirection} onSort={toggleSort}>
                  Type
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="brand" active={sortColumn === "brand"} direction={sortDirection} onSort={toggleSort}>
                  Brand
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="sku" active={sortColumn === "sku"} direction={sortDirection} onSort={toggleSort}>
                  SKU
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="barcode" active={sortColumn === "barcode"} direction={sortDirection} onSort={toggleSort}>
                  Barcode
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="name" active={sortColumn === "name"} direction={sortDirection} onSort={toggleSort}>
                  Name
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="size" active={sortColumn === "size"} direction={sortDirection} onSort={toggleSort}>
                  Size
                </SortableHeader>
              </th>
              <th className={thClass}>
                <SortableHeader column="onHand" active={sortColumn === "onHand"} direction={sortDirection} onSort={toggleSort}>
                  On hand
                </SortableHeader>
              </th>
              <th className={thClass}>CRP</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={8}>
                  {products.length === 0 ? emptyMessage : "No products match that filter."}
                </td>
              </tr>
            ) : (
              sorted.map((product) => (
                <tr key={product.id}>
                  <td className={cn(tdClass, "whitespace-nowrap")}>{classificationTagsLabel(product.classifications) || "—"}</td>
                  <td className={tdClass}>{product.brand || "—"}</td>
                  <td className={tdClass}>{formatSku(product.sku)}</td>
                  <td className={tdClass}>{formatSku(product.barcode)}</td>
                  <td className={tdClass}>{product.name || product.orderName || "—"}</td>
                  <td className={tdClass}>{product.sizeLabel || "—"}</td>
                  <td className={tdClass}>{formatQty(product.onHand)}</td>
                  <td className={tdClass}>{formatMoney(confirmedRetailPrice(product.unitCost, product.rrp))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
