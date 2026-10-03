"use client";

import { useMemo, useRef, useState } from "react";
import { recordStockOutReport } from "../actions";
import { btnClass, fieldClass } from "@/lib/ui";
import { StockOutLinesEditor, type StockOutLine } from "../stock-out-lines-editor";
import type { Option } from "@/components/product-picker";

export function NewStockOutForm({
  branchId,
  branchName,
  inhouseProducts,
}: {
  branchId: string;
  branchName: string;
  inhouseProducts: Option[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [entryDate, setEntryDate] = useState(today);
  const [lines, setLines] = useState<StockOutLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

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

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span>Entry date</span>
          <input
            className={fieldClass}
            type="date"
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            required
          />
        </label>
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
        <StockOutLinesEditor products={inhouseProducts} reportDate={entryDate} lines={lines} onLinesChange={setLines} />
      </div>

      <button className={btnClass} disabled={pending || lines.length === 0} type="submit">
        {pending ? "Saving…" : `Save stock-out for ${branchName}`}
      </button>
    </form>
  );
}
