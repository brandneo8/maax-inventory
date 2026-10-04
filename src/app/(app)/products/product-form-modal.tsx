"use client";

import { useEffect, useId, useState } from "react";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass } from "@/lib/ui";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The fields the product form edits — a subset of a catalogue row. */
export type ProductFormValues = {
  orderName: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  brandSub: string;
  size: string;
  supplierId: string;
  unitCost: string;
  rrp: string;
  threshold: string;
  isSet: boolean;
};

/** The supplier's order form line a product is paired with, shown for reference while editing. */
export type ProductFormReference = {
  source: string;
  sku: string;
  description: string;
  size: string;
  cost: number | null;
  rrp: number | null;
};

/**
 * Adding or editing one product, as a form. It's the only way to change a
 * product's own details on the catalogue (bulk changes to several products
 * use the bulk edit form). The parent validates and saves.
 */
export function ProductFormModal({
  mode,
  initial,
  suppliers,
  brandOptions,
  brandSubsByBrand,
  bundleContentsLabel,
  reference = null,
  onSubmit,
  onEditContents,
  onDelete,
  onClose,
}: {
  mode: "add" | "edit";
  initial: ProductFormValues;
  suppliers: { id: string; name: string }[];
  brandOptions: string[];
  brandSubsByBrand: Map<string, string[]>;
  /** For a saved bundle: what it contains now (e.g. "3 products"). */
  bundleContentsLabel?: string | null;
  /** The order form line it's paired with on a price list, to copy values from. */
  reference?: ProductFormReference | null;
  /** Saves; throw an Error to show its message in the form. */
  onSubmit: (values: ProductFormValues) => Promise<void>;
  /** A saved bundle: open its contents picker. */
  onEditContents?: () => void;
  /** A saved product: delete it. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.orderName.trim()) {
      setError("Enter an order name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this product.");
      setPending(false);
    }
  }

  const subs = brandSubsByBrand.get(values.brand.trim()) ?? [];
  const field = (key: keyof ProductFormValues) => `${id}-${key}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => void submit(event)}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {mode === "add" ? "Add product" : `Edit ${initial.orderName || "product"}`}
          </h2>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          {reference ? (
            <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
              <p className="font-medium text-sky-900">Order form ({reference.source})</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sky-900">
                <dt className="text-sky-700">Description</dt>
                <dd>{reference.description || "—"}</dd>
                <dt className="text-sky-700">SKU</dt>
                <dd>{reference.sku || "—"}</dd>
                <dt className="text-sky-700">Size</dt>
                <dd>{reference.size || "—"}</dd>
                <dt className="text-sky-700">Price</dt>
                <dd className="tabular-nums">{reference.cost == null ? "—" : formatMoney(reference.cost)}</dd>
                <dt className="text-sky-700">RRP</dt>
                <dd className="tabular-nums">{reference.rrp == null ? "—" : formatMoney(reference.rrp)}</dd>
              </dl>
              <button
                type="button"
                className="text-sm font-medium text-sky-800 underline"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    sku: reference.sku || current.sku,
                    unitCost: reference.cost == null ? current.unitCost : String(reference.cost),
                    rrp: reference.rrp == null ? current.rrp : String(reference.rrp),
                  }))
                }
              >
                Use the order form&apos;s SKU, unit cost and RRP
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2" htmlFor={field("orderName")}>
              <span>Order name *</span>
              <input
                id={field("orderName")}
                className={fieldClass}
                value={values.orderName}
                onChange={(event) => set("orderName", event.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2" htmlFor={field("name")}>
              <span>Name</span>
              <input
                id={field("name")}
                className={fieldClass}
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("sku")}>
              <span>SKU</span>
              <input id={field("sku")} className={fieldClass} value={values.sku} onChange={(event) => set("sku", event.target.value)} />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("barcode")}>
              <span>Barcode</span>
              <input
                id={field("barcode")}
                className={fieldClass}
                value={values.barcode}
                onChange={(event) => set("barcode", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("brand")}>
              <span>Brand</span>
              <input
                id={field("brand")}
                className={fieldClass}
                list={`${id}-brands`}
                value={values.brand}
                onChange={(event) => set("brand", event.target.value)}
              />
              <datalist id={`${id}-brands`}>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("brandSub")}>
              <span>Brand sub</span>
              <input
                id={field("brandSub")}
                className={fieldClass}
                list={`${id}-subs`}
                value={values.brandSub}
                onChange={(event) => set("brandSub", event.target.value)}
              />
              <datalist id={`${id}-subs`}>
                {subs.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("size")}>
              <span>Size</span>
              <input
                id={field("size")}
                className={fieldClass}
                value={values.size}
                placeholder="e.g. 250ml"
                onChange={(event) => set("size", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("supplierId")}>
              <span>Supplier</span>
              <select
                id={field("supplierId")}
                className={fieldClass}
                value={values.supplierId}
                onChange={(event) => set("supplierId", event.target.value)}
              >
                <option value="">No supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("unitCost")}>
              <span>Unit cost (before GST)</span>
              <input
                id={field("unitCost")}
                className={fieldClass}
                type="number"
                min="0"
                step="0.01"
                value={values.unitCost}
                onChange={(event) => set("unitCost", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("rrp")}>
              <span>RRP</span>
              <input
                id={field("rrp")}
                className={fieldClass}
                type="number"
                min="0"
                step="0.01"
                value={values.rrp}
                onChange={(event) => set("rrp", event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor={field("threshold")}>
              <span>Low stock threshold</span>
              <input
                id={field("threshold")}
                className={fieldClass}
                type="number"
                min="0"
                step="1"
                value={values.threshold}
                onChange={(event) => set("threshold", event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <label className="flex items-center gap-2" htmlFor={field("isSet")}>
              <input
                id={field("isSet")}
                type="checkbox"
                className={checkboxClass}
                checked={values.isSet}
                onChange={(event) => set("isSet", event.target.checked)}
              />
              This is a bundle of other products
            </label>
            {values.isSet ? (
              mode === "edit" && onEditContents && initial.isSet ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">Contents: {bundleContentsLabel || "none yet"}</span>
                  <button type="button" className={cn(btnSecondaryClass, "px-3 py-1.5 text-xs")} onClick={onEditContents}>
                    Edit contents
                  </button>
                </div>
              ) : (
                <p className="text-muted">Save first, then open Edit again to choose what it contains.</p>
              )
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <div>
            {mode === "edit" && onDelete ? (
              <button type="button" className="text-sm text-red-700 underline" onClick={onDelete} disabled={pending}>
                Delete product
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnSecondaryClass} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={btnClass} disabled={pending}>
              {pending ? "Saving…" : mode === "add" ? "Add product" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
