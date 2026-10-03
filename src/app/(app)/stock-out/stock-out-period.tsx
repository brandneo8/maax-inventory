"use client";

import { formatDate } from "@/lib/format";
import { fieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The period a stock-out covers: a fixed start (the day after the previous
 * stock-out ended, or the salon's opening day) and an end date the user
 * picks, up to `maxEnd`. Open dates on the lines must fall inside it.
 */
export function StockOutPeriod({
  start,
  end,
  maxEnd,
  onEndChange,
}: {
  start: string;
  end: string;
  maxEnd: string;
  onEndChange: (end: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <div>
        <h2 className="text-base font-semibold text-sky-950">Stock-out period</h2>
        <p className="mt-0.5 text-sm text-sky-900/80">
          Stock-outs run back to back so the same use is never logged twice. This one starts the day after the last one
          ended; open dates on the lines must fall within the period.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <span className="block text-xs font-medium text-sky-900">Start date</span>
          <p className="rounded-lg border border-sky-200 bg-white px-3 py-2 font-medium tabular-nums">
            {formatDate(start)}
          </p>
        </div>
        <span className="pb-2 text-sky-900" aria-hidden>
          to
        </span>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-sky-900">End date</span>
          <input
            id="stock-out-end-date"
            className={cn(fieldClass, "w-auto")}
            type="date"
            min={start}
            max={maxEnd}
            value={end}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              onEndChange(value < start ? start : value > maxEnd ? maxEnd : value);
            }}
            required
          />
        </label>
        <p className="pb-2 text-xs text-sky-900/80">Latest allowed: {formatDate(maxEnd)}</p>
      </div>
    </div>
  );
}
