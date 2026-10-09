import { FormSkeleton, LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// New stock-out: the period fields, then the lines editor.
export default function NewStockOutLoading() {
  return (
    <LoadingRegion label="Loading new stock-out…">
      <PageHeaderSkeleton title="New stock-out" backLink />
      <FormSkeleton fields={2} />
      <TableSkeleton rows={3} columns={4} />
    </LoadingRegion>
  );
}
