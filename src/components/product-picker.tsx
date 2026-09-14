"use client";

import { useMemo, useState } from "react";
import { fieldClass } from "@/lib/ui";
import { searchFieldsMatch } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { ProductClassification } from "@/lib/labels";

export type Option = {
  id: string;
  label: string;
  sku?: string | null;
  barcode?: string | null;
  sizeLabel?: string | null;
};
export type ProductOption = Option & {
  defaultClassification: ProductClassification | null;
  unitCost: number;
  sku: string | null;
  sizeLabel: string | null;
  branchAvgCost: number | null;
};

const MAX_PRODUCT_MATCHES = 50;

export function ProductPicker<T extends Option>({
  products,
  value,
  onSelect,
}: {
  products: T[];
  value: string;
  onSelect: (product: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = products.find((product) => product.id === value);

  const matches = useMemo(() => {
    const needle = query.trim();
    const pool = needle
      ? products.filter((product) => searchFieldsMatch([product.label, product.sku, product.barcode], needle))
      : products;
    return pool.slice(0, MAX_PRODUCT_MATCHES);
  }, [products, query]);

  return (
    <div className="relative">
      <input
        className={fieldClass}
        value={open ? query : (selected?.label ?? "")}
        placeholder="Search by name, SKU, or barcode"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => setQuery(event.target.value)}
        onBlur={() => setOpen(false)}
      />
      {open ? (
        <>
          {/* Catches every outside click so it can only close the dropdown —
              never fall through to whatever field happens to be rendered
              underneath it (which previously looked like "clicking away
              selects a stale product"). */}
          <div className="fixed inset-0 z-10" onMouseDown={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">No products match.</p>
            ) : (
              matches.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={cn(
                    "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50",
                    product.id === value && "bg-slate-50 font-medium",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(product);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {product.label}
                  {product.sizeLabel ? <span className="ml-1.5 text-xs text-muted">({product.sizeLabel})</span> : null}
                </button>
              ))
            )}
            {products.length > MAX_PRODUCT_MATCHES && matches.length === MAX_PRODUCT_MATCHES ? (
              <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
                Showing the first {MAX_PRODUCT_MATCHES} matches — keep typing to narrow it down.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
