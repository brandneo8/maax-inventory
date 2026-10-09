"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordStockOutReport } from "../actions";
import { formatDate } from "@/lib/format";
import { btnClass, fieldClass } from "@/lib/ui";
import { StockOutLinesEditor, stockOutLinesProblem, type StockOutLine } from "../stock-out-lines-editor";
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
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(maxEnd);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<StockOutLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Blocks a second save while the first is still running (state updates land a render later).
  const savingRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const linesProblem = stockOutLinesProblem(lines);

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

  async function save() {
    if (savingRef.current || linesProblem) return;
    savingRef.current = true;
    setPending(true);
    setError(null);
    let opening = false;
    try {
      const attachmentFile = attachmentInputRef.current?.files?.[0];
      const result = await recordStockOutReport(
        {
          branch_id: branchId,
          entry_date: entryDate,
          notes,
          lines: lines.map((line) => ({
            product_id: line.product_id,
            quantity_used: line.quantity_used,
            entry_date: line.entry_date,
          })),
        },
        attachmentFile && attachmentFile.size > 0 ? attachmentFile : null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.warning) window.alert(result.warning);
      // Keep the button disabled while the saved stock-out opens.
      opening = true;
      router.push(`/stock-out/${result.reportId}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      if (!opening) {
        savingRef.current = false;
        setPending(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <StockOutPeriod start={periodStart} end={entryDate} maxEnd={maxEnd} onEndChange={changeEndDate} />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Notes</span>
          <input className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
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

      <div className="space-y-2">
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {!error && lines.length > 0 && linesProblem ? <p className="text-sm text-amber-800">{linesProblem}</p> : null}
        <button className={btnClass} disabled={pending || Boolean(linesProblem)} type="button" onClick={() => void save()}>
          {pending ? "Saving…" : `Save stock-out for ${branchName}`}
        </button>
      </div>
    </div>
  );
}
