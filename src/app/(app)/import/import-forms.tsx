"use client";

import { useMemo, useState } from "react";
import { createRetailUseEntry, importRetailUseCsv } from "./actions";
import { btnClass, fieldClass } from "@/lib/ui";

type Option = { id: string; label: string };

export function ImportForms({
  branchId,
  branchName,
  products,
  locations,
}: {
  branchId: string;
  branchName: string;
  products: Option[];
  locations: Option[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [error, setError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onManual(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      formData.set("branch_id", branchId);
      await createRetailUseEntry(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that entry.");
    } finally {
      setPending(false);
    }
  }

  async function onCsv(formData: FormData) {
    setPending(true);
    setCsvError(null);
    setCsvMessage(null);
    try {
      await importRetailUseCsv(formData);
      setCsvMessage("File imported. Matching rows were written to the ledger.");
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Could not import that file.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={onManual} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <input type="hidden" name="branch_id" value={branchId} />
        <h2 className="text-sm font-semibold">Key in a line</h2>
        <p className="text-xs text-muted">Saves to {branchName}.</p>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        <label className="block space-y-1 text-sm">
          <span>Location</span>
          <select key={branchId} className={fieldClass} name="store_location_id" required defaultValue={locations[0]?.id}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Product</span>
          <select className={fieldClass} name="product_id" required defaultValue="">
            <option value="" disabled>
              Select product
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Quantity used</span>
          <input className={fieldClass} type="number" name="quantity_used" min="0.01" step="0.01" required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Entry date</span>
          <input className={fieldClass} type="date" name="entry_date" defaultValue={today} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span>External reference</span>
          <input className={fieldClass} name="external_reference" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Notes</span>
          <input className={fieldClass} name="notes" />
        </label>
        <button className={btnClass} disabled={pending} type="submit">
          Save entry
        </button>
      </form>

      <form action={onCsv} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <input type="hidden" name="branch_id" value={branchId} />
        <h2 className="text-sm font-semibold">Upload CSV / Excel export</h2>
        <p className="text-sm text-muted">
          Headers: <code>sku, quantity_used, entry_date, location, external_reference, notes</code>.
          Rows are imported into {branchName}. Save Excel as CSV first.
        </p>
        {csvError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{csvError}</p>
        ) : null}
        {csvMessage ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {csvMessage}
          </p>
        ) : null}
        <input className={fieldClass} type="file" name="file" accept=".csv,text/csv" required />
        <button className={btnClass} disabled={pending} type="submit">
          Import file
        </button>
      </form>
    </div>
  );
}
