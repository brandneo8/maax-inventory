import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getStockOutReports(supabase: Client, companyId: string, branchId: string) {
  const { data: reports, error } = await supabase
    .from("stock_out_reports")
    .select("id, channel, entry_date, notes, keyed_in_by, created_at")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const list = reports ?? [];
  if (list.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from("retail_use_entries")
    .select("stock_out_report_id, quantity_used")
    .in(
      "stock_out_report_id",
      list.map((report) => report.id),
    );
  if (linesError) throw linesError;

  const totals = new Map<string, { lineCount: number; totalQuantity: number }>();
  for (const line of lines ?? []) {
    if (!line.stock_out_report_id) continue;
    const current = totals.get(line.stock_out_report_id) ?? { lineCount: 0, totalQuantity: 0 };
    current.lineCount += 1;
    current.totalQuantity += Number(line.quantity_used ?? 0);
    totals.set(line.stock_out_report_id, current);
  }

  return list.map((report) => ({
    ...report,
    lineCount: totals.get(report.id)?.lineCount ?? 0,
    totalQuantity: totals.get(report.id)?.totalQuantity ?? 0,
  }));
}

export async function getStockOutReport(
  supabase: Client,
  companyId: string,
  branchId: string,
  id: string,
) {
  const { data: report, error } = await supabase
    .from("stock_out_reports")
    .select("id, channel, entry_date, notes, keyed_in_by, created_at")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: lines, error: linesError } = await supabase
    .from("retail_use_entries")
    .select("id, product_id, quantity_used, products(sku, name, order_name)")
    .eq("stock_out_report_id", id)
    .order("id");
  if (linesError) throw linesError;

  return { ...report, lines: lines ?? [] };
}
