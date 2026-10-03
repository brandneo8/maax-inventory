"use client";

import { useRef, useState } from "react";
import { recordStockOutReport } from "../actions";
import { formatDate } from "@/lib/format";
import { btnClass, fieldClass } from "@/lib/ui";
import { StockOutLinesEditor, type StockOutLine } from "../stock-out-lines-editor";
import { StockOutPeriod } from "../stock-out-period";
import type { Option } from "@/components/product-picker";

export function NewStockOutForm({
  branchId,
  branchName,
  inhouseProducts,
  periodStart,
  maxEnd,
}: {
  branchId: string;
  branchName: string;
  inhouseProducts: Option[];
  /** Day after the previous stock-out ended, or the salon's opening day. */
  periodStart: string;
  /** Today — the latest the period can end. */
  maxEnd: string;
}) {
  const [entryDate, setEntryDate] = useState(maxEnd);
  const [lines, setLines] = useState<StockOutLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  function changeEndDate(next: string) {
    setEntryDate(next);
    // Lines dated past the new end move back to it.
    setLines((current) => current.map((line) => (line.entry_date > next ? { ...line, entry_date: next } : line)));
  }

  if (periodStart > maxEnd) {
    return (
      <p className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-950">
        The last stock-out already covers up to today, so there&apos;s nothing to log yet. The next stock-out can start on{" "}
        <strong>{formatDate(periodStart)}</strong>.
      </p>
    );
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const attachmentFile = attachmentInputRef.current?.files?.[0];
      await recordStockOutReport(
        {
          branch_id: branchId,
          entry_date: entryDate,
          notes: String(formData.get("notes") ?? ""),
          lines: lines.map((line) => ({
            product_id: line.product_id,
            quantity_used: line.quantity_used,
            entry_date: line.entry_date,
          })),
        },
        attachmentFile && attachmentFile.size > 0 ? attachmentFile : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this stock-out.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <StockOutPeriod start={periodStart} end={entryDate} maxEnd={maxEnd} onEndChange={changeEndDate} />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Notes</span>
          <input className={fieldClass} name="notes" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Attachment (optional)</span>
          <input ref={attachmentInputRef} className={fieldClass} type="file" accept="image/png,image/jpeg,image/webp" />
        </label>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Lines</h2>
        <StockOutLinesEditor
          products={inhouseProducts}
          periodStart={periodStart}
          reportDate={entryDate}
          lines={lines}
          onLinesChange={setLines}
        />
      </div>

      <button className={btnClass} disabled={pending || lines.length === 0} type="submit">
        {pending ? "Saving…" : `Save stock-out for ${branchName}`}
      </button>
    </form>
  );
}
