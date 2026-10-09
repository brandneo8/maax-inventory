import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// Renders under the workflow tabs while the stock-in list loads.
export default function StockInLoading() {
  return (
    <LoadingRegion label="Loading stock-in…">
      <PageHeaderSkeleton title="Stock-in" action />
      <TableSkeleton rows={8} columns={6} />
    </LoadingRegion>
  );
}
