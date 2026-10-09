import { cn } from "@/lib/utils";

// Building blocks for the route-level loading.tsx files. They render inside
// the (app) shell and any workflow layout, so the sidebar and tabs stay put
// while a page's data loads; only the page body is swapped for these.

/** One grey placeholder bar. Pulses unless the user prefers reduced motion. */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("h-4 animate-pulse rounded bg-slate-200 motion-reduce:animate-none", className)} />
  );
}

/** Wraps a skeleton so screen readers hear one "Loading…" instead of empty boxes. */
export function LoadingRegion({
  label = "Loading…",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={cn("space-y-6", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * The title block every page opens with. A known title is shown as real text
 * (it's the same on every load); otherwise it's a bar.
 */
export function PageHeaderSkeleton({
  title,
  backLink = false,
  action = false,
}: {
  title?: string;
  backLink?: boolean;
  action?: boolean;
}) {
  return (
    <div>
      {backLink ? <SkeletonBar className="mb-3 h-3.5 w-28" /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {title ? (
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          ) : (
            <SkeletonBar className="h-7 w-56 max-w-full" />
          )}
          <SkeletonBar className="h-3.5 w-80 max-w-full" />
        </div>
        {action ? <SkeletonBar className="h-9 w-32 rounded-lg" /> : null}
      </div>
    </div>
  );
}

/** A bordered card of label/value pairs, like an order's Supplier / Date / Notes strip. */
export function DetailsSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div aria-hidden className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="w-32 max-w-full" />
        </div>
      ))}
    </div>
  );
}

// Varying widths so the rows read as text rather than a solid block.
const CELL_WIDTHS = ["w-40", "w-24", "w-16", "w-20", "w-28", "w-12"];

/** A table card: a header row and a few body rows of bars. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-6 border-b border-border px-3 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonBar key={index} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-6 border-b border-border px-3 py-3 last:border-b-0">
          {Array.from({ length: columns }, (_, column) => (
            <SkeletonBar key={column} className={CELL_WIDTHS[(row + column) % CELL_WIDTHS.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of cards (Home's shortcuts, the Reports index). */
export function CardGridSkeleton({ cards = 3, className }: { cards?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-4 sm:grid-cols-3", className)}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <SkeletonBar className="h-10 w-10 rounded-lg" />
          <SkeletonBar className="w-32" />
          <SkeletonBar className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

/** A form card: a couple of field rows and a primary button. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div aria-hidden className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <SkeletonBar className="h-9 w-36 rounded-lg" />
    </div>
  );
}
