import { DetailsSkeleton, LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// One stock-in order: PO number and status, the details strip, then its lines.
export default function StockInOrderLoading() {
  return (
    <LoadingRegion label="Loading order…">
      <PageHeaderSkeleton backLink action />
      <DetailsSkeleton />
      <TableSkeleton rows={5} columns={6} />
    </LoadingRegion>
  );
}
