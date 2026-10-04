"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteSupplier, saveSuppliers, type SupplierDraft } from "../suppliers/actions";
import { ORDER_CHANNELS, type OrderChannel } from "@/lib/labels";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";

function emptySupplier(): SupplierDraft {
  return {
    supplier_name: "",
    poc_name: "",
    poc_number: "",
    order_channel: "",
    gst_registered: false,
  };
}

function channelLabel(value: string) {
  return ORDER_CHANNELS.find((item) => item.value === value)?.label ?? "—";
}

/**
 * Suppliers: read-only until Edit, which turns the rows into inputs (saved
 * together with Save, or dropped with Cancel). New suppliers are added
 * through a form.
 */
export function SuppliersTable({
  suppliers,
  taxRate = 9,
  productCounts,
}: {
  suppliers: SupplierDraft[];
  taxRate?: number;
  /** Products per supplier; when given, each saved supplier gets a Price list link. */
  productCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<SupplierDraft[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shown = editing ? rows : suppliers;

  function startEdit() {
    setRows(suppliers.map((supplier) => ({ ...supplier })));
    setError(null);
    setEditing(true);
  }

  function updateRow(index: number, patch: Partial<SupplierDraft>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    if (rows.some((row) => !row.supplier_name.trim())) {
      setError("Every supplier needs a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveSuppliers(rows);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save suppliers.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(index: number) {
    const row = rows[index];
    if (!row?.id) return;
    if (!window.confirm(`Delete ${row.supplier_name || "this supplier"}? This can't be undone.`)) return;
    setPending(true);
    setError(null);
    try {
      await deleteSupplier(row.id);
      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that supplier.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <>
            <button
              className={btnSecondaryClass}
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button className={btnClass} type="button" disabled={pending} onClick={() => void onSave()}>
              {pending ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button className={btnSecondaryClass} type="button" onClick={startEdit} disabled={suppliers.length === 0}>
              Edit
            </button>
            <button className={btnClass} type="button" onClick={() => setAdding(true)}>
              Add supplier
            </button>
          </>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Contact name</th>
              <th className={thClass}>Contact number</th>
              <th className={thClass}>Channel</th>
              <th className={thClass}>GST</th>
              <th className={thClass}>Tax rate</th>
              {productCounts ? <th className={thClass}>Price list</th> : null}
              {editing ? <th className={thClass} /> : null}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className={`${tdClass} text-muted`} colSpan={productCounts ? 7 : 6}>
                  No suppliers yet. Add one to get started.
                </td>
              </tr>
            ) : null}
            {shown.map((row, index) => (
              <tr key={row.id ?? `row-${index}`}>
                {editing ? (
                  <>
                    <td className={tdClass}>
                      <input
                        className={fieldClass}
                        value={row.supplier_name}
                        onChange={(event) => updateRow(index, { supplier_name: event.target.value })}
                        aria-label="Supplier name"
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={fieldClass}
                        value={row.poc_name}
                        onChange={(event) => updateRow(index, { poc_name: event.target.value })}
                        aria-label={`Contact name for ${row.supplier_name || "supplier"}`}
                      />
                    </td>
                    <td className={tdClass}>
                      <input
                        className={fieldClass}
                        value={row.poc_number}
                        onChange={(event) => updateRow(index, { poc_number: event.target.value })}
                        aria-label={`Contact number for ${row.supplier_name || "supplier"}`}
                      />
                    </td>
                    <td className={tdClass}>
                      <select
                        className={fieldClass}
                        value={row.order_channel}
                        onChange={(event) => updateRow(index, { order_channel: event.target.value as OrderChannel | "" })}
                        aria-label={`Order channel for ${row.supplier_name || "supplier"}`}
                      >
                        <option value="">None</option>
                        {ORDER_CHANNELS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={tdClass}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={row.gst_registered}
                        onChange={(event) => updateRow(index, { gst_registered: event.target.checked })}
                        aria-label={`GST registered for ${row.supplier_name || "supplier"}`}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className={`${tdClass} font-medium`}>{row.supplier_name}</td>
                    <td className={tdClass}>{row.poc_name || "—"}</td>
                    <td className={tdClass}>{row.poc_number || "—"}</td>
                    <td className={tdClass}>{row.order_channel ? channelLabel(row.order_channel) : "—"}</td>
                    <td className={tdClass}>{row.gst_registered ? "Yes" : "No"}</td>
                  </>
                )}
                <td className={tdClass}>
                  <span className="block min-w-20 text-sm">{row.gst_registered ? `${taxRate}%` : "0%"}</span>
                </td>
                {productCounts ? (
                  <td className={tdClass}>
                    {row.id ? (
                      <Link className="whitespace-nowrap text-sky-700 underline" href={`/admin/suppliers/${row.id}/products`}>
                        Price list ({productCounts[row.id] ?? 0})
                      </Link>
                    ) : null}
                  </td>
                ) : null}
                {editing ? (
                  <td className={tdClass}>
                    <button
                      className="text-sm text-red-700 underline"
                      type="button"
                      disabled={pending}
                      onClick={() => void onDelete(index)}
                    >
                      Delete
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <AddSupplierForm
          taxRate={taxRate}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function AddSupplierForm({
  taxRate,
  onClose,
  onSaved,
}: {
  taxRate: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<SupplierDraft>(emptySupplier);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!values.supplier_name.trim()) {
      setError("Enter the supplier's name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await saveSuppliers([values]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the supplier.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !pending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-white p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          Add supplier
        </h2>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2" htmlFor={`${id}-name`}>
            <span>Name *</span>
            <input
              id={`${id}-name`}
              className={fieldClass}
              value={values.supplier_name}
              onChange={(event) => setValues((current) => ({ ...current, supplier_name: event.target.value }))}
              autoFocus
              required
            />
          </label>
          <label className="space-y-1 text-sm" htmlFor={`${id}-contact`}>
            <span>Contact name</span>
            <input
              id={`${id}-contact`}
              className={fieldClass}
              value={values.poc_name}
              onChange={(event) => setValues((current) => ({ ...current, poc_name: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm" htmlFor={`${id}-number`}>
            <span>Contact number</span>
            <input
              id={`${id}-number`}
              className={fieldClass}
              value={values.poc_number}
              onChange={(event) => setValues((current) => ({ ...current, poc_number: event.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm" htmlFor={`${id}-channel`}>
            <span>Order channel</span>
            <select
              id={`${id}-channel`}
              className={fieldClass}
              value={values.order_channel}
              onChange={(event) =>
                setValues((current) => ({ ...current, order_channel: event.target.value as OrderChannel | "" }))
              }
            >
              <option value="">None</option>
              {ORDER_CHANNELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm" htmlFor={`${id}-gst`}>
            <input
              id={`${id}-gst`}
              type="checkbox"
              className={checkboxClass}
              checked={values.gst_registered}
              onChange={(event) => setValues((current) => ({ ...current, gst_registered: event.target.checked }))}
            />
            GST registered ({taxRate}%)
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondaryClass} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={btnClass} disabled={pending}>
            {pending ? "Adding…" : "Add supplier"}
          </button>
        </div>
      </form>
    </div>
  );
}
