import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getStockOutCountReview, getStockOutPeriodBounds, getStockOutReport } from "@/lib/data/stock-out";
import { getBranchStockOutProducts } from "@/lib/data/products";
import { productDisplayName } from "@/lib/format";
import { StockOutDetailPanel } from "./stock-out-detail-panel";

export default async function StockOutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const report = await getStockOutReport(supabase, companyId, branch.id, id).catch(() => null);

  if (!report) notFound();

  const lines = report.lines.map((line) => {
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    return {
      id: line.id,
      productId: line.product_id,
      label: productDisplayName(product) || "—",
      sku: product?.sku ?? null,
      quantityUsed: Number(line.quantity_used),
      entryDate: line.entry_date,
      linkedCountTxnId: line.linked_count_txn_id,
      linkedQuantity: line.linked_quantity == null ? null : Number(line.linked_quantity),
    };
  });

  const [{ inhouse }, countReview, period] = await Promise.all([
    getBranchStockOutProducts(supabase, companyId, branch.id),
    getStockOutCountReview(
      supabase,
      companyId,
      branch.id,
      lines.map((line) => ({
        id: line.id,
        product_id: line.productId,
        quantity_used: line.quantityUsed,
        entry_date: line.entryDate,
        linked_count_txn_id: line.linkedCountTxnId,
        linked_quantity: line.linkedQuantity,
        label: line.label,
        sku: line.sku,
      })),
    ),
    getStockOutPeriodBounds(supabase, companyId, branch.id, report.id),
  ]);

  return (
    <StockOutDetailPanel
      reportId={report.id}
      branchName={branch.displayName}
      entryDate={report.entry_date}
      periodStart={period.start}
      maxEnd={period.maxEnd}
      notes={report.notes}
      keyedInBy={report.keyed_in_by}
      createdAt={report.created_at}
      attachmentUrl={report.attachment_url}
      lines={lines}
      inhouseProducts={inhouse}
      countReview={countReview}
    />
  );
}
