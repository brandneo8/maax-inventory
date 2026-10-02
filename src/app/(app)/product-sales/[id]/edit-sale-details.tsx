"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProductSaleDetails } from "../actions";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";

/**
 * Report date and remarks on a confirmed sale — the only parts that can
 * change after it's posted. The report date is bounded by today and by the
 * latest line's date sold (each line posted on its own date).
 */
export function EditSaleDetails({
  saleId,
  saleDate,
  notes,
  today,
  earliestAllowed,
}: {
  saleId: string;
  saleDate: string;
  notes: string | null;
  today: string;
  earliestAllowed: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(saleDate);
  const [remarks, setRemarks] = useState(notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateProductSaleDetails({ sale_id: saleId, sale_date: date, notes: remarks });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these changes.");
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="space-y-1">
          <p>
            <span className="text-muted">Report date:</span> {saleDate}
          </p>
          <p>
            <span className="text-muted">Remarks:</span> {notes || "—"}
          </p>
        </div>
        <button type="button" className={btnSecondaryClass} onClick={() => setEditing(true)}>
          Edit report date &amp; remarks
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
        <label className="space-y-1 text-sm">
          <span>Report date</span>
          <input
            className={fieldClass}
            type="date"
            min={earliestAllowed || undefined}
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Remarks</span>
          <textarea
            className={fieldClass}
            rows={2}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="e.g. POS report reference"
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Changing the report date doesn&apos;t move stock — each line posted on its own date sold
        {earliestAllowed ? `, so it can't be before ${earliestAllowed}` : ""}.
      </p>
      <div className="flex gap-2">
        <button type="button" className={btnClass} onClick={() => void save()} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          className={btnSecondaryClass}
          onClick={() => {
            setEditing(false);
            setDate(saleDate);
            setRemarks(notes ?? "");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
