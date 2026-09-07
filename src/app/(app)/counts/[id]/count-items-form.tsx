"use client";

import { useState } from "react";
import { completeInventoryCount, saveCountQuantities } from "../actions";
import { formatQty } from "@/lib/format";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";

type Item = {
  id: string;
  label: string;
  location: string;
  expected: number;
  counted: number | null;
  variance: number | null;
};

export function CountItemsForm({ countId, items }: { countId: string; items: Item[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "complete" | null>(null);

  async function run(action: typeof saveCountQuantities, kind: "save" | "complete", formData: FormData) {
    setPending(kind);
    setError(null);
    try {
      await action(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the count.");
      setPending(null);
    }
  }

  return (
    <form className="space-y-4">
      <input type="hidden" name="count_id" value={countId} />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={thClass}>Location</th>
              <th className={thClass}>Expected</th>
              <th className={thClass}>Counted</th>
              <th className={thClass}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className={tdClass}>{item.label}</td>
                <td className={tdClass}>{item.location}</td>
                <td className={tdClass}>{formatQty(item.expected)}</td>
                <td className={tdClass}>
                  <input
                    className={fieldClass}
                    type="number"
                    step="0.01"
                    name={`counted:${item.id}`}
                    defaultValue={item.counted ?? ""}
                  />
                </td>
                <td className={tdClass}>{item.variance === null ? "—" : formatQty(item.variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={btnSecondaryClass}
          disabled={pending !== null}
          type="submit"
          formAction={(formData) => run(saveCountQuantities, "save", formData)}
        >
          {pending === "save" ? "Saving…" : "Save quantities"}
        </button>
        <button
          className={btnClass}
          disabled={pending !== null}
          type="submit"
          formAction={(formData) => run(completeInventoryCount, "complete", formData)}
        >
          {pending === "complete" ? "Completing…" : "Complete and post variances"}
        </button>
      </div>
    </form>
  );
}
