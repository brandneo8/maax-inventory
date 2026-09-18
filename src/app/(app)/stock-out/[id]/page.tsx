import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getStockOutReport } from "@/lib/data/stock-out";
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

  const { retail, inhouse } = await getBranchStockOutProducts(supabase, companyId, branch.id);

  const lines = report.lines.map((line) => {
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    return {
      id: line.id,
      productId: line.product_id,
      label: productDisplayName(product) || "—",
      quantityUsed: Number(line.quantity_used),
      entryDate: line.entry_date,
    };
  });

  return (
    <StockOutDetailPanel
      reportId={report.id}
      branchName={branch.displayName}
      type={report.channel === "inhouse" ? "inhouse" : "retail"}
      entryDate={report.entry_date}
      notes={report.notes}
      keyedInBy={report.keyed_in_by}
      createdAt={report.created_at}
      attachmentUrl={report.attachment_url}
      lines={lines}
      retailProducts={retail}
      inhouseProducts={inhouse}
    />
  );
}
