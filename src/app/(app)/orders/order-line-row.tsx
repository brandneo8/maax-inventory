"use client";

import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { fieldClass } from "@/lib/ui";
import { ProductPicker, type ProductOption } from "@/components/product-picker";

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

export function OrderLineRow({
  line,
  products,
  onChange,
  onRemove,
  removable,
}: {
  line: EditableLine;
  products: ProductOption[];
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="grid grid-cols-1 items-end gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-12">
      <label className="space-y-1 text-sm md:col-span-5">
        <span>Product</span>
        <ProductPicker
          products={products}
          value={line.product_id}
          onSelect={(product) =>
            onChange({
              product_id: product.id,
              classification: product.defaultClassification ?? line.classification,
              unit_price: product.unitCost,
            })
          }
        />
      </label>
      <label className="space-y-1 text-sm md:col-span-2">
        <span>Type</span>
        <select
          className={fieldClass}
          value={line.classification}
          onChange={(event) => onChange({ classification: event.target.value as ProductClassification })}
        >
          {CLASSIFICATIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm md:col-span-1">
        <span>Qty</span>
        <input
          className={fieldClass}
          type="number"
          min="0.01"
          step="0.01"
          value={line.quantity_ordered}
          onChange={(event) => onChange({ quantity_ordered: Number(event.target.value) })}
        />
      </label>
      <label className="space-y-1 text-sm md:col-span-2">
        <span>Unit price</span>
        <input
          className={fieldClass}
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(event) => onChange({ unit_price: Number(event.target.value) })}
        />
      </label>
      <div className="md:col-span-2">
        {removable ? (
          <button
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-slate-50"
            type="button"
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
