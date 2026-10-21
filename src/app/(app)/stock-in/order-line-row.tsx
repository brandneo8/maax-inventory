"use client";

import { useEffect, useState } from "react";
import { type ProductClassification } from "@/lib/labels";
import { blurOnWheel, btnClass, fieldClass, numberFieldClass } from "@/lib/ui";
import { ProductPicker, type ProductOption } from "@/components/product-picker";
import { cn } from "@/lib/utils";

export type EditableLine = {
  key: string;
  product_id: string;
  classification: ProductClassification;
  quantity_ordered: number;
  unit_price: number;
};

export function emptyLine(product?: ProductOption): EditableLine {
  return {
    key: crypto.randomUUID(),
    product_id: product?.id ?? "",
    classification: product?.defaultClassification ?? "retail",
    quantity_ordered: 1,
    unit_price: product?.unitCost ?? 0,
  };
}

export function AddOrderLine({
  products,
  onAdd,
  onAddNewProduct,
  selectProductId = "",
}: {
  products: ProductOption[];
  onAdd: (line: EditableLine) => void;
  onAddNewProduct?: (query: string) => void;
  selectProductId?: string;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (selectProductId) setProductId(selectProductId);
  }, [selectProductId]);

  const selected = products.find((product) => product.id === productId);
  const canAdd = Boolean(selected) && quantity > 0;

  function handleAdd() {
    if (!selected || !canAdd) return;
    onAdd({ ...emptyLine(selected), quantity_ordered: quantity });
    setProductId("");
    setQuantity(1);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
      <label className="min-w-64 flex-1 space-y-1 text-sm">
        <span>Search product</span>
        <ProductPicker
          products={products}
          value={productId}
          onSelect={(product) => setProductId(product.id)}
          onAddNewProduct={onAddNewProduct}
        />
      </label>
      <div className="w-20 space-y-1 text-sm">
        <span className="text-muted">Size</span>
        <p className="px-3 py-2 text-sm">{selected?.sizeLabel || "—"}</p>
      </div>
      <label className="w-28 space-y-1 text-sm">
        <span>Quantity</span>
        <input
          className={cn(fieldClass, numberFieldClass)}
          type="number"
          min="1"
          step="1"
          value={quantity === 0 ? "" : quantity}
          onWheel={blurOnWheel}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              setQuantity(0);
              return;
            }
            const parsed = Math.round(Number(raw));
            if (Number.isFinite(parsed)) setQuantity(Math.max(0, parsed));
          }}
          onBlur={() => {
            if (!quantity) setQuantity(1);
          }}
        />
      </label>
      <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
        Add
      </button>
    </div>
  );
}
