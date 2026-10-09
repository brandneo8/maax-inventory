import { LoadingRegion, PageHeaderSkeleton, SkeletonBar, TableSkeleton } from "@/components/page-skeleton";

// Renders under the workflow tabs while the Inventory Balance workspace loads.
export default function OrdersLoading() {
  return (
    <LoadingRegion label="Loading orders…">
      <PageHeaderSkeleton title="Orders" />
      <div className="space-y-4">
        <div aria-hidden className="flex gap-4 border-b border-border pb-2">
          <SkeletonBar className="w-28" />
          <SkeletonBar className="w-24" />
        </div>
        <TableSkeleton rows={8} columns={6} />
      </div>
    </LoadingRegion>
  );
}
