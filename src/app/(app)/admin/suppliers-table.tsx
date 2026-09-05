"use client";

import { useState } from "react";
import { deleteSupplier, saveSuppliers, type SupplierDraft } from "../suppliers/actions";
import { ORDER_CHANNELS, type OrderChannel } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";

function emptyRow(): SupplierDraft {
  return {
    supplier_name: "",
    poc_name: "",
    poc_number: "",
    order_channel: "",
    gst_registered: false,
  };
}

export function SuppliersTable({ suppliers }: { suppliers: SupplierDraft[] }) {
  const [rows, setRows] = useState<SupplierDraft[]>(suppliers.length > 0 ? suppliers : [emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateRow(index: number, patch: Partial<SupplierDraft>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await saveSuppliers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save suppliers.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(index: number) {
    const row = rows[index];
    if (!row) return;
    setPending(true);
    setError(null);
    try {
      if (row.id) {
        await deleteSupplier(row.id);
      }
      setRows((current) => {
        const next = current.filter((_, rowIndex) => rowIndex !== index);
        return next.length > 0 ? next : [emptyRow()];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that supplier.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
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
              <th className={thClass} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id ?? `new-${index}`}>
                <td className={tdClass}>
                  <input
                    className={fieldClass}
                    value={row.supplier_name}
                    onChange={(event) => updateRow(index, { supplier_name: event.target.value })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    className={fieldClass}
                    value={row.poc_name}
                    onChange={(event) => updateRow(index, { poc_name: event.target.value })}
                  />
                </td>
                <td className={tdClass}>
                  <input
                    className={fieldClass}
                    value={row.poc_number}
                    onChange={(event) => updateRow(index, { poc_number: event.target.value })}
                  />
                </td>
                <td className={tdClass}>
                  <select
                    className={fieldClass}
                    value={row.order_channel}
                    onChange={(event) =>
                      updateRow(index, { order_channel: event.target.value as OrderChannel | "" })
                    }
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
                    checked={row.gst_registered}
                    onChange={(event) => updateRow(index, { gst_registered: event.target.checked })}
                  />
                </td>
                <td className={tdClass}>
                  <button
                    className="text-sm text-muted underline"
                    type="button"
                    disabled={pending}
                    onClick={() => onDelete(index)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button className={btnSecondaryClass} type="button" onClick={() => setRows((current) => [...current, emptyRow()])}>
          Add row
        </button>
        <button className={btnClass} type="button" disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save suppliers"}
        </button>
      </div>
    </div>
  );
}
