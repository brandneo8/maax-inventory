"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { saveTypedOrderFormLines, type TypedOrderFormLine } from "@/app/(app)/admin/suppliers/order-form-actions";
import type { OrderFormLine } from "@/lib/order-form-reader";
import type { ComparisonProduct } from "./order-form-comparison";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type DraftLine = TypedOrderFormLine & { key: string };

function draftOf(line?: OrderFormLine): DraftLine {
  return {
    key: crypto.randomUUID(),
    sku: line?.sku ?? "",
    description: line?.description ?? "",
    size: line?.size ?? "",
    cost: line?.cost == null ? "" : line.cost.toFixed(2),
    rrp: line?.rrp == null ? "" : line.rrp.toFixed(2),
  };
}

/** A line copied from a Pulse product: its SKU, then its order name, size, unit cost and RRP. */
function draftFromProduct(product: ComparisonProduct): DraftLine {
  return {
    key: crypto.randomUUID(),
    sku: product.sku,
    description: product.orderName || product.name,
    size: product.size,
    cost: product.unitCost > 0 ? product.unitCost.toFixed(2) : "",
    rrp: product.rrp == null ? "" : product.rrp.toFixed(2),
  };
}

const sameLines = (left: DraftLine[], right: DraftLine[]) =>
  left.length === right.length &&
  left.every(
    (line, index) =>
      line.sku === right[index].sku &&
      line.description === right[index].description &&
      line.size === right[index].size &&
      line.cost === right[index].cost &&
      line.rrp === right[index].rrp,
  );

/**
 * A photo order form: the picture beside a table to type its lines into.
 * Saved lines become the order form side of the comparison below, just as
 * a spreadsheet's rows would.
 */
export function OrderFormImageEntry({
  supplierId,
  brandId,
  brand,
  imageUrl,
  fileName,
  lines,
  pulseProducts,
}: {
  supplierId: string;
  brandId: string;
  brand: string;
  imageUrl: string | null;
  fileName: string;
  /** The lines saved so far. */
  lines: OrderFormLine[];
  /** This brand's products on the price list, to copy in as a starting point. */
  pulseProducts: ComparisonProduct[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => (lines.length > 0 ? lines.map(draftOf) : []));
  const [drafts, setDrafts] = useState<DraftLine[]>(() => (saved.length > 0 ? saved : [draftOf()]));
  const [zoomed, setZoomed] = useState(false);
  /** Starts open while no lines are saved, folded once there are some. */
  const [open, setOpen] = useState(lines.length === 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const dirty = !sameLines(drafts.filter((line) => !isBlank(line)), saved);

  function isBlank(line: TypedOrderFormLine) {
    return ![line.sku, line.description, line.size, line.cost, line.rrp].some((value) => value.trim());
  }

  function update(key: string, patch: Partial<TypedOrderFormLine>) {
    setDrafts((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setMessage(null);
  }

  function addLine() {
    const line = draftOf();
    setDrafts((current) => [...current, line]);
    setFocusKey(line.key);
  }

  /** Fills the table with this brand's Pulse products (by SKU), to correct against the photo before saving. */
  function copyFromPulse() {
    if (
      drafts.some((line) => !isBlank(line)) &&
      !window.confirm(`Replace the lines in the table with the ${pulseProducts.length} ${brand} products on Pulse?`)
    ) {
      return;
    }
    const copied = [...pulseProducts]
      .sort((left, right) => {
        if (!left.sku !== !right.sku) return left.sku ? -1 : 1;
        return (
          left.sku.localeCompare(right.sku, undefined, { numeric: true }) ||
          (left.orderName || left.name).localeCompare(right.orderName || right.name)
        );
      })
      .map(draftFromProduct);
    setDrafts(copied.length > 0 ? copied : [draftOf()]);
    setError(null);
    setMessage(null);
  }

  async function save() {
    const filled = drafts.filter((line) => !isBlank(line));
    const missing = filled.findIndex((line) => !line.description.trim());
    if (missing >= 0) {
      setError(`Line ${missing + 1} needs a description.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveTypedOrderFormLines(
        supplierId,
        brandId,
        filled.map(({ sku, description, size, cost, rrp }) => ({ sku, description, size, cost, rrp })),
      );
      setSaved(filled);
      setDrafts(filled.length > 0 ? filled : [draftOf()]);
      setMessage(`Saved ${filled.length} line${filled.length === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the lines.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="block text-base font-semibold">Type in the {brand} order form</span>
          <span className="block text-sm text-muted">
            {open
              ? "This order form is a photo, so its lines are typed in: one row per product shown, with the supplier's price (excl. GST) and RRP. Saved lines are compared with Pulse below."
              : `${saved.length} line${saved.length === 1 ? "" : "s"} saved${dirty ? " · unsaved changes" : ""}. Click to show the photo and the lines.`}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-1 size-5 shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div className={cn("grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]", !open && "hidden")}>
        <div className="space-y-1">
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-slate-50">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file
              <img
                src={imageUrl}
                alt={`${brand} order form (${fileName})`}
                className={cn("block cursor-zoom-in", zoomed ? "max-w-none cursor-zoom-out" : "h-auto w-full")}
                onClick={() => setZoomed((current) => !current)}
              />
            ) : (
              <p className="p-4 text-sm text-muted">The photo couldn&apos;t be loaded. Reload the page to try again.</p>
            )}
          </div>
          <p className="text-xs text-muted">
            Click the photo to {zoomed ? "fit it to the box" : "see it full size"}
            {imageUrl ? (
              <>
                {" "}
                or{" "}
                <a className="underline" href={imageUrl} target="_blank" rel="noreferrer">
                  open it in a new tab
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="space-y-2">
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
            <table className={cn(tableClass, "border-separate border-spacing-0")}>
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className={thClass}>#</th>
                  <th className={thClass}>SKU</th>
                  <th className={thClass}>Description *</th>
                  <th className={thClass}>Size</th>
                  <th className={cn(thClass, "text-right")}>Price</th>
                  <th className={cn(thClass, "text-right")}>RRP</th>
                  <th className={thClass}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((line, index) => (
                  <tr key={line.key}>
                    <td className={cn(tdClass, "text-sm text-muted tabular-nums")}>{index + 1}</td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, "min-w-20")}
                        value={line.sku}
                        autoFocus={line.key === focusKey}
                        onChange={(event) => update(line.key, { sku: event.target.value })}
                        aria-label={`Line ${index + 1} SKU`}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, "min-w-48")}
                        value={line.description}
                        onChange={(event) => update(line.key, { description: event.target.value })}
                        aria-label={`Line ${index + 1} description`}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, "min-w-20")}
                        value={line.size}
                        onChange={(event) => update(line.key, { size: event.target.value })}
                        placeholder="e.g. 250 ml"
                        aria-label={`Line ${index + 1} size`}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, "min-w-20 text-right")}
                        inputMode="decimal"
                        value={line.cost}
                        onChange={(event) => update(line.key, { cost: event.target.value })}
                        placeholder="0.00"
                        aria-label={`Line ${index + 1} price`}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, "min-w-20 text-right")}
                        inputMode="decimal"
                        value={line.rrp}
                        onChange={(event) => update(line.key, { rrp: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && index === drafts.length - 1) {
                            event.preventDefault();
                            addLine();
                          }
                        }}
                        placeholder="0.00"
                        aria-label={`Line ${index + 1} RRP`}
                      />
                    </td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        className="text-sm text-red-700 underline"
                        disabled={pending}
                        onClick={() => {
                          setDrafts((current) => current.filter((item) => item.key !== line.key));
                          setMessage(null);
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnSecondaryClass} disabled={pending} onClick={addLine}>
              Add line
            </button>
            <button
              type="button"
              className={btnSecondaryClass}
              disabled={pending || pulseProducts.length === 0}
              onClick={copyFromPulse}
              title="Fill the table with this brand's Pulse products (SKU, order name, size, unit cost, RRP), then correct them against the photo"
            >
              Copy from Pulse ({pulseProducts.length})
            </button>
            <button type="button" className={btnClass} disabled={pending || !dirty} onClick={() => void save()}>
              {pending ? "Saving…" : "Save lines"}
            </button>
            {dirty && saved.length > 0 ? (
              <button
                type="button"
                className={btnSecondaryClass}
                disabled={pending}
                onClick={() => {
                  setDrafts(saved.length > 0 ? saved : [draftOf()]);
                  setError(null);
                }}
              >
                Discard changes
              </button>
            ) : null}
            <span className="text-sm text-muted">
              {dirty ? "Unsaved changes." : message ?? `${saved.length} line${saved.length === 1 ? "" : "s"} saved.`} Press
              Enter in the RRP box of the last line to add another.
            </span>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
