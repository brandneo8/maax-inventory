"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { updateStockOutReport, type StockOutType } from "../actions";
import { formatDate } from "@/lib/format";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { StockOutLinesEditor, StockOutQuantityDisplay, type StockOutLine } from "../stock-out-lines-editor";
import { DeleteStockOutButton } from "../delete-stock-out-button";
import { cn } from "@/lib/utils";
import type { Option } from "@/components/product-picker";

const TYPE_OPTIONS: { value: StockOutType; label: string; description: string }[] = [
  { value: "retail", label: "Retail use", description: "Products tagged Retail or GWP for this salon." },
  { value: "inhouse", label: "Inhouse use", description: "Products tagged In-house for this salon." },
];

function typeLabel(value: StockOutType) {
  return TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

type DisplayLine = { id: string; productId: string; label: string; quantityUsed: number; entryDate: string };

export function StockOutDetailPanel({
  reportId,
  branchName,
  type: initialType,
  entryDate: initialEntryDate,
  notes: initialNotes,
  keyedInBy,
  createdAt,
  attachmentUrl,
  lines,
  retailProducts,
  inhouseProducts,
}: {
  reportId: string;
  branchName: string;
  type: StockOutType;
  entryDate: string;
  notes: string | null;
  keyedInBy: string | null;
  createdAt: string;
  attachmentUrl: string | null;
  lines: DisplayLine[];
  retailProducts: Option[];
  inhouseProducts: Option[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<StockOutType>(initialType);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [editLines, setEditLines] = useState<StockOutLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const products = type === "retail" ? retailProducts : inhouseProducts;

  function startEditing() {
    setType(initialType);
    setEntryDate(initialEntryDate);
    setNotes(initialNotes ?? "");
    setEditLines(
      lines.map((line) => ({
        key: line.id,
        product_id: line.productId,
        quantity_used: line.quantityUsed,
        entry_date: line.entryDate,
      })),
    );
    setError(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    setEditing(true);
  }

  function selectType(next: StockOutType) {
    if (next === type) return;
    setType(next);
    setEditLines([]);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const attachmentFile = attachmentInputRef.current?.files?.[0];
      await updateStockOutReport(
        {
          report_id: reportId,
          type,
          entry_date: entryDate,
          notes,
          lines: editLines.map((line) => ({
            product_id: line.product_id,
            quantity_used: line.quantity_used,
            entry_date: line.entry_date,
          })),
        },
        attachmentFile && attachmentFile.size > 0 ? attachmentFile : null,
      );
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock-out" className="text-sm text-muted underline">
          ← Back to Stock-out
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {editing ? "Edit stock-out" : `${typeLabel(initialType)} · ${formatDate(initialEntryDate)}`}
            </h1>
            <p className="mt-1 text-sm text-muted">Working in {branchName}.</p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  className={btnSecondaryClass}
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  className={btnClass}
                  type="button"
                  onClick={() => void save()}
                  disabled={pending || editLines.length === 0}
                >
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : (
              <>
                <button className={btnSecondaryClass} type="button" onClick={startEditing}>
                  Edit
                </button>
                <DeleteStockOutButton reportId={reportId} />
              </>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {editing ? (
        <>
          <div className="space-y-2">
            <span className="text-sm font-medium">Type</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectType(option.value)}
                  className={cn(
                    "rounded-xl border p-4 text-left",
                    type === option.value
                      ? "border-sky-400 bg-sky-50"
                      : "border-border bg-card hover:bg-slate-50",
                  )}
                >
                  <p className="font-medium">{option.label}</p>
                  <p className="mt-1 text-sm text-muted">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

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
              <input className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Attachment {attachmentUrl ? "(replace)" : "(optional)"}</span>
              <input
                ref={attachmentInputRef}
                className={fieldClass}
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </label>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Lines</h2>
            <StockOutLinesEditor products={products} reportDate={entryDate} lines={editLines} onLinesChange={setEditLines} />
          </div>
        </>
      ) : (
        <>
          <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Notes</dt>
              <dd>{initialNotes || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Keyed in by</dt>
              <dd>{keyedInBy || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Recorded</dt>
              <dd>{formatDate(createdAt)}</dd>
            </div>
          </dl>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Product</th>
                    <th className={thClass}>Use date</th>
                    <th className={cn(thClass, "w-1/5 text-right")}>Quantity used</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className={tdClass}>{line.label}</td>
                      <td className={tdClass}>{formatDate(line.entryDate)}</td>
                      <td className={cn(tdClass, "w-1/5 text-right")}>
                        <StockOutQuantityDisplay quantityUsed={line.quantityUsed} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-muted">Reference image</p>
              {attachmentUrl ? (
                <a href={attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachmentUrl}
                    alt="Stock-out reference"
                    className="max-h-80 w-full rounded-lg border border-border bg-white object-contain"
                  />
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted">No image attached. Click Edit to add one.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
