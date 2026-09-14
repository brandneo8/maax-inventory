"use client";

import { useState } from "react";
import { blurOnWheel, btnSecondaryClass, fieldClass, numberFieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function BulkLineActionsBar({
  onApplyAvgCost,
  onApplyDiscount,
  onSetQuantity,
  onSetUnitPrice,
  priceLabel = "avg paid here",
  qtyMin = 1,
}: {
  onApplyAvgCost: () => void;
  onApplyDiscount: (percent: number) => void;
  onSetQuantity: (qty: number) => void;
  onSetUnitPrice: (price: number) => void;
  priceLabel?: string;
  qtyMin?: number;
}) {
  const [discountPercent, setDiscountPercent] = useState(0);
  const [bulkQty, setBulkQty] = useState(qtyMin);
  const [bulkUnitPrice, setBulkUnitPrice] = useState(0);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-card p-3">
      <button className={btnSecondaryClass} type="button" onClick={onApplyAvgCost}>
        Apply {priceLabel} to all lines
      </button>
      <div className="flex items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Unit price</span>
          <input
            className={cn(fieldClass, numberFieldClass, "w-24")}
            type="number"
            min="0"
            step="0.01"
            value={bulkUnitPrice === 0 ? "" : bulkUnitPrice}
            onWheel={blurOnWheel}
            onChange={(event) => {
              const raw = event.target.value;
              setBulkUnitPrice(raw === "" ? 0 : Math.max(0, Number(raw) || 0));
            }}
          />
        </label>
        <button className={btnSecondaryClass} type="button" onClick={() => onSetUnitPrice(bulkUnitPrice)}>
          Apply price to all lines
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Bulk discount %</span>
          <input
            className={cn(fieldClass, numberFieldClass, "w-24")}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={discountPercent === 0 ? "" : discountPercent}
            onWheel={blurOnWheel}
            onChange={(event) => {
              const raw = event.target.value;
              setDiscountPercent(raw === "" ? 0 : Math.min(100, Math.max(0, Number(raw) || 0)));
            }}
          />
        </label>
        <button className={btnSecondaryClass} type="button" onClick={() => onApplyDiscount(discountPercent)}>
          Apply discount to all lines
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Set quantity</span>
          <input
            className={cn(fieldClass, numberFieldClass, "w-24")}
            type="number"
            min={qtyMin}
            step="1"
            value={bulkQty === 0 ? "" : bulkQty}
            onWheel={blurOnWheel}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                setBulkQty(0);
                return;
              }
              const parsed = Math.round(Number(raw));
              if (Number.isFinite(parsed)) setBulkQty(Math.max(0, parsed));
            }}
            onBlur={() => {
              if (bulkQty < qtyMin) setBulkQty(qtyMin);
            }}
          />
        </label>
        <button className={btnSecondaryClass} type="button" onClick={() => onSetQuantity(bulkQty)}>
          Apply quantity to all lines
        </button>
      </div>
    </div>
  );
}
