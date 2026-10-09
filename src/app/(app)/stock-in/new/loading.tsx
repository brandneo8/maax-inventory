import { FormSkeleton, LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// New stock-in: supplier and date fields, then the order lines.
export default function NewStockInLoading() {
  return (
    <LoadingRegion label="Loading new stock-in…">
      <PageHeaderSkeleton title="New stock-in" backLink />
      <FormSkeleton fields={2} />
      <TableSkeleton rows={3} columns={5} />
    </LoadingRegion>
  );
}
