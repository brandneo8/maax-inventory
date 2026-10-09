import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// One stock-out: its period heading, then the lines deducted.
export default function StockOutDetailLoading() {
  return (
    <LoadingRegion label="Loading stock-out…">
      <PageHeaderSkeleton backLink action />
      <TableSkeleton rows={6} columns={4} />
    </LoadingRegion>
  );
}
