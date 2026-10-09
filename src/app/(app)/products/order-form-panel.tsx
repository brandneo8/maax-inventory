"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FileImage, FileSpreadsheet, FileText } from "lucide-react";
import {
  removeSupplierOrderForm,
  uploadSupplierOrderForm,
} from "@/app/(app)/admin/suppliers/order-form-actions";
import type { BrandOrderForm } from "@/lib/data/order-forms";
import { OrderFormCurrency } from "./order-form-currency";
import { formatDateTime } from "@/lib/format";
import { btnClass, btnSecondaryClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

function fileSize(bytes: number | null) {
  if (bytes == null) return "";
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The selected brand's order form on a supplier's price list: the one
 * current CSV / Excel file, photo or PDF, with download, replace and remove — or
 * an upload button when there isn't one yet.
 */
export function OrderFormPanel({
  supplierId,
  entry,
}: {
  supplierId: string;
  entry: BrandOrderForm;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = entry.form;
  const Icon =
    form?.kind !== "image"
      ? FileSpreadsheet
      : form.fileName.toLowerCase().endsWith(".pdf")
        ? FileText
        : FileImage;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      form &&
      !window.confirm(
        `Replace ${form.fileName} with ${file.name}? Only one order form is kept per brand.`,
      )
    )
      return;
    setPending(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("file", file);
      await uploadSupplierOrderForm(supplierId, entry.brandId, data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the order form.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!form || !window.confirm(`Remove the ${entry.brandName} order form (${form.fileName})?`))
      return;
    setPending(true);
    setError(null);
    try {
      await removeSupplierOrderForm(supplierId, entry.brandId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the order form.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border bg-card p-4",
        form ? "border-emerald-200" : "border-dashed border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon
            className={cn("size-6 shrink-0", form ? "text-emerald-600" : "text-slate-400")}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{entry.brandName} order form</p>
            {form ? (
              <p className="truncate text-sm text-muted">
                {form.fileName}
                {form.sizeBytes != null ? ` · ${fileSize(form.sizeBytes)}` : ""} · uploaded{" "}
                {formatDateTime(form.uploadedAt)}
                {form.uploadedBy ? ` by ${form.uploadedBy}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">
                No order form uploaded yet. Upload the supplier&apos;s CSV or Excel file, or a JPG /
                PNG photo or PDF of a short list (you then type its lines in).
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {form?.downloadUrl ? (
            <a className={btnSecondaryClass} href={form.downloadUrl}>
              Download
            </a>
          ) : null}
          <button
            type="button"
            className={form ? btnSecondaryClass : btnClass}
            onClick={() => inputRef.current?.click()}
            disabled={pending}
          >
            {pending ? "Working…" : form ? "Replace" : "Upload order form"}
          </button>
          {form ? (
            <button
              type="button"
              className="text-sm text-red-700 underline"
              onClick={() => void remove()}
              disabled={pending}
            >
              Remove
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.jpg,.jpeg,.png,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,.pdf,application/pdf"
            className="hidden"
            onChange={(event) => void upload(event)}
          />
        </div>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {form ? (
        <OrderFormCurrency
          key={`${form.uploadedAt}:${form.currency ?? ""}:${form.fxRate ?? ""}`}
          supplierId={supplierId}
          brandId={entry.brandId}
          form={form}
        />
      ) : null}
    </div>
  );
}
