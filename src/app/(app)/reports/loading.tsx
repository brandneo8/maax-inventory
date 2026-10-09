import { LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// Covers the Reports index and the report pages under it (none has its own
// loading.tsx), so a title bar and a table card fits all of them.
export default function ReportsLoading() {
  return (
    <LoadingRegion label="Loading report…">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </LoadingRegion>
  );
}
