"use client";

import { useState } from "react";
import { roundMoney } from "@/lib/catalog-pricing";
import { formatMoney, formatQty } from "@/lib/format";
import { blurOnWheel, fieldClass, numberFieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { computeOrderTotals } from "./order-totals-calc";

export function OrderTotals({
  lines,
  gstRegistered,
  gstRate,
  adjustment,
  adjustmentLabel = "Rounding / adjustment",
  adjustmentInput,
  fxAdjustment,
  fxInput,
  totalQuantity,
  uniqueSkuCount,
  onAdjustmentSave,
}: {
  lines: { quantity_ordered: number; unit_price: number }[];
  gstRegistered: boolean;
  gstRate: number;
  adjustment?: number;
  adjustmentLabel?: string;
  /** Makes the rounding row an inline input (raw typed text), like `fxInput`. */
  adjustmentInput?: { value: string; onChange: (value: string) => void };
  /** Currency exchange clearing amount — part of the invoice total, shown on its own line. */
  fxAdjustment?: number;
  /**
   * Makes the FX clearing row an inline input, so the amount can be tuned
   * right here against the running total. `value` is the raw text being typed.
   */
  fxInput?: { value: string; onChange: (value: string) => void };
  totalQuantity?: number;
  uniqueSkuCount?: number;
  onAdjustmentSave?: (value: number) => Promise<void> | void;
}) {
  const { subtotal, taxTotal, grandTotal } = computeOrderTotals(lines, gstRegistered, gstRate);
  const roundedAdjustment = roundMoney(adjustmentInput ? Number(adjustmentInput.value) || 0 : (adjustment ?? 0));
  const roundedFx = roundMoney(fxInput ? Number(fxInput.value) || 0 : (fxAdjustment ?? 0));
  const finalTotal = roundMoney(grandTotal + roundedAdjustment + roundedFx);

  const [editingAdjustment, setEditingAdjustment] = useState(false);
  const [draftAdjustmentText, setDraftAdjustmentText] = useState(String(roundedAdjustment));
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  function startEditingAdjustment() {
    setDraftAdjustmentText(String(roundedAdjustment));
    setAdjustmentError(null);
    setEditingAdjustment(true);
  }

  async function saveAdjustment() {
    if (!onAdjustmentSave) return;
    setSavingAdjustment(true);
    setAdjustmentError(null);
    try {
      await onAdjustmentSave(Number(draftAdjustmentText) || 0);
      setEditingAdjustment(false);
    } catch (err) {
      setAdjustmentError(err instanceof Error ? err.message : "Could not save this adjustment.");
    } finally {
      setSavingAdjustment(false);
    }
  }

  return (
    <div className="ml-auto grid w-full max-w-xs gap-1 rounded-xl border border-border bg-card p-4 text-sm">
      {totalQuantity != null ? (
        <div className="flex items-center justify-between">
          <span className="text-muted">Total quantity</span>
          <span>{formatQty(totalQuantity)}</span>
        </div>
      ) : null}
      {uniqueSkuCount != null ? (
        <div className="flex items-center justify-between border-b border-border pb-1">
          <span className="text-muted">Unique SKUs</span>
          <span>{uniqueSkuCount}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-muted">Subtotal</span>
        <span>{formatMoney(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted">GST{gstRegistered ? ` (${gstRate}%)` : ""}</span>
        <span>{formatMoney(taxTotal)}</span>
      </div>
      {adjustmentInput ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">{adjustmentLabel}</span>
          <input
            className={cn(fieldClass, numberFieldClass, "w-28 px-2 py-1 text-right")}
            type="number"
            step="0.01"
            placeholder="0.00"
            aria-label={adjustmentLabel}
            value={adjustmentInput.value}
            onWheel={blurOnWheel}
            onChange={(event) => adjustmentInput.onChange(event.target.value)}
          />
        </div>
      ) : onAdjustmentSave ? (
        editingAdjustment ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{adjustmentLabel}</span>
              <div className="flex items-center gap-1">
                <input
                  className={cn(fieldClass, numberFieldClass, "w-20 px-2 py-1")}
                  type="number"
                  step="0.01"
                  autoFocus
                  value={draftAdjustmentText}
                  onWheel={blurOnWheel}
                  onChange={(event) => setDraftAdjustmentText(event.target.value)}
                  disabled={savingAdjustment}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-muted underline"
                onClick={() => setEditingAdjustment(false)}
                disabled={savingAdjustment}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-blue-600 underline"
                onClick={() => void saveAdjustment()}
                disabled={savingAdjustment}
              >
                {savingAdjustment ? "Saving…" : "Save"}
              </button>
            </div>
            {adjustmentError ? <p className="text-red-700">{adjustmentError}</p> : null}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">{adjustmentLabel}</span>
            <button type="button" className="underline" onClick={startEditingAdjustment}>
              {formatMoney(roundedAdjustment)}
            </button>
          </div>
        )
      ) : roundedAdjustment !== 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-muted">{adjustmentLabel}</span>
          <span>{formatMoney(roundedAdjustment)}</span>
        </div>
      ) : null}
      {fxInput ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted" title="Amount that makes the total match the PDF invoice (+ loss, − gain). Doesn't change product costs.">
            FX clearing
          </span>
          <input
            className={cn(fieldClass, numberFieldClass, "w-28 px-2 py-1 text-right")}
            type="number"
            step="0.01"
            placeholder="0.00"
            aria-label="FX clearing"
            value={fxInput.value}
            onWheel={blurOnWheel}
            onChange={(event) => fxInput.onChange(event.target.value)}
          />
        </div>
      ) : roundedFx !== 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-muted">FX clearing</span>
          <span>{formatMoney(roundedFx)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
        <span>Total</span>
        <span>{formatMoney(finalTotal)}</span>
      </div>
    </div>
  );
}
