"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { createInventoryCount } from "../actions";
import { formatDate } from "@/lib/format";
import { CLASSIFICATIONS } from "@/lib/labels";
import { btnClass, fieldClass } from "@/lib/ui";

type Option = { id: string; label: string };

export function CountForm({
  brands,
  tags,
  today,
  latestPostedDate,
}: {
  brands: Option[];
  tags: Option[];
  today: string;
  latestPostedDate: string | null;
}) {
  const maxDate = latestPostedDate && latestPostedDate >= today ? latestPostedDate : undefined;
  const defaultDate = maxDate && today > maxDate ? maxDate : today;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createInventoryCount(formData);
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not start the count.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Count date</span>
          <input
            className={fieldClass}
            type="date"
            name="count_date"
            defaultValue={defaultDate}
            min={today}
            max={maxDate}
            required
          />
          <span className="block text-xs text-muted">
            Today is {formatDate(today)} (Singapore). Dates before today are not allowed
            {maxDate
              ? `, and you cannot choose a date after the latest confirmed count (${formatDate(maxDate)}).`
              : ". Future dates can be scheduled, then confirmed on that day."}
            {latestPostedDate
              ? ` Confirming another count on ${formatDate(latestPostedDate)} replaces the previous confirmed count for that day.`
              : " Confirming another count on the same day replaces the previous confirmed count for that day."}
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span>Brand</span>
          <select className={fieldClass} name="filter_brand_id" defaultValue="">
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select className={fieldClass} name="filter_classification" defaultValue="">
            <option value="">All types</option>
            {CLASSIFICATIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Tag</span>
          <select className={fieldClass} name="filter_tag_id" defaultValue="">
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Starting…" : "Start count"}
      </button>
    </form>
  );
}
