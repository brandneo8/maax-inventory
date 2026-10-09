import { FormSkeleton, LoadingRegion, PageHeaderSkeleton, TableSkeleton } from "@/components/page-skeleton";

// Confirm & receive: invoice fields, then the lines being received.
export default function ReceiveOrderLoading() {
  return (
    <LoadingRegion label="Loading receiving form…">
      <PageHeaderSkeleton backLink />
      <FormSkeleton fields={4} />
      <TableSkeleton rows={5} columns={5} />
    </LoadingRegion>
  );
}
