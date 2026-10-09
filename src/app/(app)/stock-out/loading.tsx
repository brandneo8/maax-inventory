import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// Renders under the workflow tabs while the stock-out list loads.
export default function StockOutLoading() {
  return (
    <LoadingRegion label="Loading stock-out…">
      <PageHeaderSkeleton title="Stock-out" action />
      <TableSkeleton rows={8} columns={6} />
    </LoadingRegion>
  );
}
