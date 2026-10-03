"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMoney, formatMonthLabel } from "@/lib/format";

// Months share the full width of the card; once they'd get narrower than
// MIN_MONTH_WIDTH, each keeps that width and the chart scrolls sideways
// instead of squeezing. Drawn 1:1 in pixels, so the axis text stays small.
const MIN_MONTH_WIDTH = 96;
const AXIS_WIDTH = 56;
const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 26 };
const LABEL_SIZE = 11;
const BAR_WIDTH = 24;
const PURCHASE_COLOR = "#0284c7"; // sky-600
const COGS_COLOR = "#d97706"; // amber-600

/** A round axis step giving about four gridlines up to `max`. */
function niceStep(max: number) {
  if (max <= 0) return 1;
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function compactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Monthly purchases (stock bought in) against cost of goods sold, as paired
 * bars — the same figures as the Monthly inventory report's "Inventory
 * ordered" and "Cost of goods sold" rows. Hovering (or focusing) a month
 * shows both amounts. The money axis stays put while the months scroll.
 */
export function MonthlyChart({ months, purchases, cogs }: { months: string[]; purchases: number[]; cogs: number[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [available, setAvailable] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track the full width of the chart's own block (not the scroller, whose
  // width follows its content) as the card resizes; the months share all of
  // it bar the money axis.
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth - AXIS_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Floored so a chart that fits never shows a stray 1px scrollbar.
  const monthWidth = Math.max(MIN_MONTH_WIDTH, Math.floor((available - PAD.right) / Math.max(months.length, 1)));

  // Open on the latest months; earlier ones are a scroll to the left.
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [months.length, monthWidth]);

  const values = [...purchases, ...cogs];
  const step = niceStep(Math.max(0, ...values));
  const top = Math.max(step, Math.ceil(Math.max(0, ...values) / step) * step);
  const bottom = Math.min(0, Math.floor(Math.min(0, ...values) / step) * step);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + ((top - value) / (top - bottom)) * plotHeight;
  const plotWidth = months.length * monthWidth + PAD.right;
  const ticks: number[] = [];
  for (let tick = bottom; tick <= top + step / 2; tick += step) ticks.push(tick);

  return (
    <div ref={rootRef} className="w-full space-y-3">
      <div className="flex w-full">
        {/* Money axis: outside the scroller, so it stays visible. */}
        <svg width={AXIS_WIDTH} height={HEIGHT} className="shrink-0" aria-hidden>
          {ticks.map((tick) => (
            <text
              key={tick}
              x={AXIS_WIDTH - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={LABEL_SIZE}
              fill="#64748b"
            >
              {compactMoney(tick)}
            </text>
          ))}
        </svg>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto" onMouseLeave={() => setActive(null)}>
          <div className="relative" style={{ width: plotWidth }}>
            <svg
              width={plotWidth}
              height={HEIGHT}
              role="img"
              aria-label="Monthly purchases and cost of goods sold"
              className="block"
            >
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? "#94a3b8" : "#e2e8f0"}
                  strokeWidth={1}
                />
              ))}
              {months.map((month, index) => {
                const left = index * monthWidth;
                const center = left + monthWidth / 2;
                const isActive = active === index;
                const bars = [
                  { value: purchases[index] ?? 0, color: PURCHASE_COLOR, x: center - BAR_WIDTH - 2, key: "purchases" },
                  { value: cogs[index] ?? 0, color: COGS_COLOR, x: center + 2, key: "cogs" },
                ];
                return (
                  <g key={month}>
                    {/* The whole month column is the hover target, not just the bars. */}
                    <rect
                      x={left}
                      y={PAD.top}
                      width={monthWidth}
                      height={plotHeight}
                      fill={isActive ? "#f1f5f9" : "transparent"}
                      onMouseEnter={() => setActive(index)}
                      onFocus={() => setActive(index)}
                      onBlur={() => setActive(null)}
                      tabIndex={0}
                      aria-label={`${formatMonthLabel(month)}: purchases ${formatMoney(purchases[index] ?? 0)}, cost of goods sold ${formatMoney(cogs[index] ?? 0)}`}
                      className="cursor-default outline-none"
                    />
                    {bars.map((bar) => {
                      const barTop = y(Math.max(bar.value, 0));
                      const barHeight = Math.abs(y(bar.value) - y(0));
                      return (
                        <rect
                          key={bar.key}
                          x={bar.x}
                          y={barTop}
                          width={BAR_WIDTH}
                          height={Math.max(barHeight, bar.value === 0 ? 0 : 1)}
                          rx={2}
                          fill={bar.color}
                          opacity={active == null || isActive ? 1 : 0.45}
                          pointerEvents="none"
                        />
                      );
                    })}
                    <text
                      x={center}
                      y={HEIGHT - 8}
                      textAnchor="middle"
                      fontSize={LABEL_SIZE}
                      fill={isActive ? "#0f172a" : "#64748b"}
                      pointerEvents="none"
                    >
                      {formatMonthLabel(month)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {active != null ? (
              <div
                className="pointer-events-none absolute top-1 z-10 w-max rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-md"
                style={
                  // Beside the hovered month: to its right, or its left near the end.
                  active >= months.length - 2 && months.length > 2
                    ? { right: plotWidth - active * monthWidth + 4 }
                    : { left: (active + 1) * monthWidth + 4 }
                }
                role="status"
              >
                <p className="mb-1 font-semibold text-slate-900">{formatMonthLabel(months[active])}</p>
                <p className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="inline-block size-2 rounded-sm" style={{ background: PURCHASE_COLOR }} aria-hidden />
                    Purchases
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(purchases[active] ?? 0)}</span>
                </p>
                <p className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="inline-block size-2 rounded-sm" style={{ background: COGS_COLOR }} aria-hidden />
                    Cost of goods sold
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(cogs[active] ?? 0)}</span>
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: PURCHASE_COLOR }} aria-hidden />
          Purchases
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: COGS_COLOR }} aria-hidden />
          Cost of goods sold
        </span>
      </div>
    </div>
  );
}
