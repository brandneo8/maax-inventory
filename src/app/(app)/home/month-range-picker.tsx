"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { shiftMonth } from "@/lib/format";
import { fieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * From/to month pickers for a section of Home. Each section keeps its range
 * in its own URL params (the chart's ?from=&to=, the products table's
 * ?pfrom=&pto=), so changing one leaves the others as they are.
 */
export function MonthRangePicker({
  from,
  to,
  maxMonth,
  fromParam,
  toParam,
  idPrefix,
  maxSpan = 24,
}: {
  from: string;
  to: string;
  maxMonth: string;
  fromParam: string;
  toParam: string;
  idPrefix: string;
  /** Most months the range may cover, inclusive. */
  maxSpan?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(which: "from" | "to", value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    // While a year is still being typed the input reports e.g. "0002-05";
    // wait for a real year before reloading.
    if (value < "2000-01") return;
    // Keep the month just picked; if the range would pass maxSpan months,
    // the other end moves with it (and "to" never passes maxMonth).
    let nextFrom = which === "from" ? value : from;
    let nextTo = which === "to" ? (value > maxMonth ? maxMonth : value) : to;
    if (nextFrom > nextTo) [nextFrom, nextTo] = [nextTo, nextFrom];
    if (shiftMonth(nextFrom, maxSpan - 1) < nextTo) {
      if (which === "from") nextTo = shiftMonth(nextFrom, maxSpan - 1);
      else nextFrom = shiftMonth(nextTo, -(maxSpan - 1));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(fromParam, nextFrom);
    params.set(toParam, nextTo);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className={cn("flex flex-wrap items-end gap-2 text-sm", pending && "opacity-60")} aria-busy={pending}>
      <span className="sr-only">Up to {maxSpan} months.</span>
      <label className="space-y-1">
        <span className="block text-xs text-muted">From</span>
        <input
          id={`${idPrefix}-from`}
          className={cn(fieldClass, "w-auto py-1.5")}
          type="month"
          value={from}
          max={maxMonth}
          onChange={(event) => update("from", event.target.value)}
          disabled={pending}
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">To</span>
        <input
          id={`${idPrefix}-to`}
          className={cn(fieldClass, "w-auto py-1.5")}
          type="month"
          value={to}
          max={maxMonth}
          onChange={(event) => update("to", event.target.value)}
          disabled={pending}
        />
      </label>
    </div>
  );
}
