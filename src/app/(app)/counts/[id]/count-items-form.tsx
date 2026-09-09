"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeInventoryCount, saveCountQuantities } from "../actions";
import { formatQty } from "@/lib/format";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type CountLine = {
  id: string;
  label: string;
  name: string;
  sku: string;
  brand: string;
  location: string;
  expected: number;
  counted: number | null;
  variance: number | null;
};

function liveVariance(expected: number, counted: string) {
  if (counted.trim() === "") return null;
  const amount = Number(counted);
  if (!Number.isFinite(amount)) return null;
  return amount - expected;
}

function lineMatches(item: CountLine, needle: string) {
  if (!needle) return true;
  return [item.label, item.name, item.sku, item.brand, item.location].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

export function CountItemsForm({
  countId,
  items,
  editable = true,
}: {
  countId: string;
  items: CountLine[];
  editable?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "complete" | "count" | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.counted == null ? "" : String(item.counted)])),
  );
  const [recentIds, setRecentIds] = useState<string[]>(() => items.filter((item) => item.counted != null).map((item) => item.id));
  const [brandFilter, setBrandFilter] = useState("");
  const [query, setQuery] = useState("");
  const [searchQty, setSearchQty] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const brands = useMemo(
    () => [...new Set(items.map((item) => item.brand.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const scoped = useMemo(
    () =>
      items.filter((item) => {
        if (brandFilter && item.brand !== brandFilter) return false;
        return true;
      }),
    [brandFilter, items],
  );

  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    return scoped.filter((item) => lineMatches(item, needle)).slice(0, 8);
  }, [needle, scoped]);

  const selected = selectedId ? (scoped.find((item) => item.id === selectedId) ?? items.find((item) => item.id === selectedId)) : null;

  const rows = useMemo(() => {
    const rank = new Map(recentIds.map((id, index) => [id, index]));
    return [...scoped].sort((left, right) => {
      const leftRank = rank.has(left.id) ? rank.get(left.id)! : Number.POSITIVE_INFINITY;
      const rightRank = rank.has(right.id) ? rank.get(right.id)! : Number.POSITIVE_INFINITY;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
  }, [recentIds, scoped]);

  function setCounted(id: string, value: string) {
    setQuantities((current) => ({ ...current, [id]: value }));
  }

  function bump(id: string) {
    setRecentIds((current) => [id, ...current.filter((item) => item !== id)]);
  }

  function pickMatch(item: CountLine) {
    setSelectedId(item.id);
    setQuery(item.brand ? `${item.label} · ${item.brand}` : item.label);
    bump(item.id);
    if (editable) window.setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function persist(nextQuantities: Record<string, string>, kind: "save" | "complete" | "count") {
    const formData = new FormData();
    formData.set("count_id", countId);
    for (const item of items) {
      const value = nextQuantities[item.id];
      if (value != null && value !== "") formData.set(`counted:${item.id}`, value);
    }
    if (kind === "complete") await completeInventoryCount(formData);
    else await saveCountQuantities(formData);
  }

  async function applySearchCount() {
    const target = selected ?? (matches.length === 1 ? matches[0] : null);
    if (!target) {
      setError("Search a product or brand, then choose the line to count.");
      return;
    }
    if (searchQty.trim() === "" || !Number.isFinite(Number(searchQty))) {
      setError("Enter a counted quantity.");
      return;
    }
    const next = { ...quantities, [target.id]: String(Number(searchQty)) };
    setQuantities(next);
    bump(target.id);
    setPending("count");
    setError(null);
    setMessage(null);
    try {
      await persist(next, "count");
      setMessage(`Counted ${target.label}.`);
      setQuery("");
      setSearchQty("");
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that count.");
    } finally {
      setPending(null);
    }
  }

  async function run(kind: "save" | "complete") {
    setPending(kind);
    setError(null);
    setMessage(null);
    try {
      await persist(quantities, kind);
      if (kind === "save") setMessage("Saved counted quantities.");
      if (kind === "complete") router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the count.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="relative space-y-1 text-sm md:col-span-1">
          <span>Find product</span>
          <input
            className={fieldClass}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!selected && matches[0]) pickMatch(matches[0]);
                else void applySearchCount();
              }
            }}
            placeholder="Product name or brand"
            autoComplete="off"
          />
          {needle && matches.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg">
              {matches.map((item) => (
                <li key={item.id}>
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    type="button"
                    onClick={() => pickMatch(item)}
                  >
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-xs text-muted">
                      {[item.brand || "No brand", item.location, `expected ${formatQty(item.expected)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {needle && matches.length === 0 ? (
            <p className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted shadow-lg">
              No matching products in this count.
            </p>
          ) : null}
        </label>
        {editable ? (
          <>
            <label className="space-y-1 text-sm">
              <span>Counted qty</span>
              <input
                ref={qtyRef}
                className={fieldClass}
                type="number"
                min="0"
                step="0.01"
                value={searchQty}
                onChange={(event) => setSearchQty(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void applySearchCount();
                  }
                }}
                placeholder="0"
              />
            </label>
            <div className="flex items-end">
              <button
                className={btnClass}
                type="button"
                disabled={pending !== null}
                onClick={() => void applySearchCount()}
              >
                {pending === "count" ? "Counting…" : "Count"}
              </button>
            </div>
          </>
        ) : (
          <p className="self-end text-sm text-muted md:col-span-2">Search to bring a counted line to the top.</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 space-y-1 text-sm">
          <span>Brand</span>
          <select
            className={fieldClass}
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-sm text-muted">
          {rows.length} line{rows.length === 1 ? "" : "s"}
          {brandFilter ? ` · ${brandFilter}` : ""}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Product</th>
              <th className={thClass}>Brand</th>
              <th className={thClass}>Location</th>
              <th className={thClass}>Expected</th>
              <th className={thClass}>Counted</th>
              <th className={thClass}>Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={6}>
                  No products match that brand filter.
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const counted = quantities[item.id] ?? "";
                const variance = liveVariance(item.expected, counted);
                const recent = recentIds[0] === item.id;
                return (
                  <tr key={item.id} className={recent ? "bg-sky-50" : undefined}>
                    <td className={tdClass}>{item.label}</td>
                    <td className={tdClass}>{item.brand || "—"}</td>
                    <td className={tdClass}>{item.location}</td>
                    <td className={tdClass}>{formatQty(item.expected)}</td>
                    <td className={tdClass}>
                      {editable ? (
                        <input
                          className={cn(fieldClass, "w-28")}
                          type="number"
                          min="0"
                          step="0.01"
                          name={`counted:${item.id}`}
                          value={counted}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCounted(item.id, value);
                            if (value.trim() !== "") bump(item.id);
                          }}
                        />
                      ) : (
                        formatQty(item.counted)
                      )}
                    </td>
                    <td className={tdClass}>{variance === null ? "—" : formatQty(variance)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button
            className={btnSecondaryClass}
            disabled={pending !== null}
            type="button"
            onClick={() => void run("save")}
          >
            {pending === "save" ? "Saving…" : "Save quantities"}
          </button>
          <button
            className={btnClass}
            disabled={pending !== null}
            type="button"
            onClick={() => void run("complete")}
          >
            {pending === "complete" ? "Completing…" : "Complete and post variances"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
