"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export function SuppliersTable({
  suppliers,
  onChange,
  onDirtyIdsChange,
  taxRate = 9,
}: {
  suppliers: SupplierDraft[];
  onChange?: (rows: SupplierDraft[]) => void;
  onDirtyIdsChange?: (ids: Set<string>) => void;
  taxRate?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SupplierDraft[]>(suppliers.length > 0 ? suppliers : [emptyRow()]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setRows(suppliers.length > 0 ? suppliers : [emptyRow()]);
  }, [suppliers]);

  function markDirty(id: string | undefined) {
    if (!id) return;
    setDirtyIds((current) => {
      const next = new Set(current).add(id);
      onDirtyIdsChange?.(next);
      return next;
    });
  }

  function clearDirty() {
    const next = new Set<string>();
    setDirtyIds(next);
    onDirtyIdsChange?.(next);
  }

  function commit(next: SupplierDraft[]) {
    setRows(next);
    onChange?.(next);
  }

  function updateRow(index: number, patch: Partial<SupplierDraft>) {
    const current = rows[index];
    if (current?.id && (patch.supplier_name != null || patch.poc_name != null || patch.poc_number != null || patch.order_channel != null)) {
      markDirty(current.id);
    }
    commit(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function onGstChange(index: number, gstRegistered: boolean) {
    const row = rows[index];
    if (!row) return;
    commit(rows.map((item, rowIndex) => (rowIndex === index ? { ...item, gst_registered: gstRegistered } : item)));
    if (!row.id) return;
    try {
      setError(null);
      const response = await fetch("/admin/supplier-gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, gstRegistered }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not save GST.");
      }
    } catch (err) {
      commit(rows.map((item, rowIndex) => (rowIndex === index ? { ...item, gst_registered: row.gst_registered } : item)));
      setError(err instanceof Error ? err.message : "Could not save GST.");
    }
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await saveSuppliers(rows);
      clearDirty();
      router.refresh();
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
      const next = rows.filter((_, rowIndex) => rowIndex !== index);
      commit(next.length > 0 ? next : [emptyRow()]);
      if (row.id) {
        setDirtyIds((current) => {
          const nextDirty = new Set(current);
          nextDirty.delete(row.id!);
          onDirtyIdsChange?.(nextDirty);
          return nextDirty;
        });
      }
      router.refresh();
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
              <th className={thClass}>Tax rate</th>
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
                    onChange={(event) => onGstChange(index, event.target.checked)}
                    aria-label={`GST registered for ${row.supplier_name || "supplier"}`}
                  />
                </td>
                <td className={tdClass}>
                  <span className="block min-w-20 text-sm">{row.gst_registered ? `${taxRate}%` : "0%"}</span>
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
        <button className={btnSecondaryClass} type="button" onClick={() => commit([...rows, emptyRow()])}>
          Add row
        </button>
        <button className={btnClass} type="button" disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save suppliers"}
        </button>
      </div>
    </div>
  );
}
