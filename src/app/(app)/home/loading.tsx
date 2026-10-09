import { CardGridSkeleton, LoadingRegion, SkeletonBar } from "@/components/page-skeleton";

// Shown while Home's reports load: the shortcut cards, then the chart card and tables.
export default function HomeLoading() {
  return (
    <LoadingRegion label="Loading Home…" className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <SkeletonBar className="h-3.5 w-48" />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Key actions</h2>
        <CardGridSkeleton cards={3} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Reports</h2>
        <div aria-hidden className="space-y-4 rounded-xl border border-border bg-card p-4">
          <SkeletonBar className="h-5 w-72 max-w-full" />
          <SkeletonBar className="h-3.5 w-96 max-w-full" />
          <div className="flex gap-10">
            <SkeletonBar className="h-8 w-32" />
            <SkeletonBar className="h-8 w-32" />
          </div>
          <SkeletonBar className="h-56 w-full rounded-lg" />
        </div>
      </section>
    </LoadingRegion>
  );
}
