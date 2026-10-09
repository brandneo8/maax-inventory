import { getCountShortfalls } from "@/lib/data/product-sales";
import { addDays, singaporeToday } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export async function getStockOutReports(supabase: Client, companyId: string, branchId: string) {
  const { data: reports, error } = await supabase
    .from("stock_out_reports")
    .select("id, channel, period_start, entry_date, notes, keyed_in_by, created_at")
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
    .select("id, channel, period_start, entry_date, notes, keyed_in_by, created_at, attachment_url")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: lines, error: linesError } = await supabase
    .from("retail_use_entries")
    .select("id, product_id, quantity_used, entry_date, linked_count_txn_id, linked_quantity, products(sku, name, order_name)")
    .eq("stock_out_report_id", id)
    .order("id");
  if (linesError) throw linesError;

  return { ...report, lines: lines ?? [] };
}

export type StockOutCountReviewRow = {
  entryId: string;
  productId: string;
  label: string;
  sku: string | null;
  openDate: string;
  quantity: number;
  isBundle: boolean;
  /** Units of this line currently covered by the count (0 = extra deduction). */
  coveredQuantity: number;
  /** The count that would have caught this use: the first confirmed one on or after the open date. */
  countId: string | null;
  countDate: string | null;
  /** That count's shortfall for the product, if it found one. */
  shortfallTxnId: string | null;
  /** Units of that shortfall this line could cover, counting what it already covers. */
  coverable: number;
};

/**
 * The lines of a stock-out opened on or before the salon's latest confirmed
 * count — use the count may already have caught as a shortfall. For each,
 * the count that would have seen it (the first confirmed count on or after
 * the open date) and that count's shortfall for the product, if any, so the
 * user can mark the line as covered by it instead of an extra deduction.
 */
export async function getStockOutCountReview(
  supabase: Client,
  companyId: string,
  branchId: string,
  lines: { id: string; product_id: string; quantity_used: number; entry_date: string; linked_count_txn_id: string | null; linked_quantity: number | null; label: string; sku: string | null }[],
) {
  const { data: counts, error: countsError } = await supabase
    .from("inventory_counts")
    .select("id, count_date")
    .eq("company_id", companyId)
    .eq("branch_id", branchId)
    .eq("status", "completed")
    .order("count_date");
  if (countsError) throw countsError;
  const confirmed = counts ?? [];
  const latestCountDate = confirmed.length > 0 ? confirmed[confirmed.length - 1].count_date : null;
  if (!latestCountDate) return { latestCountDate, rows: [] as StockOutCountReviewRow[] };

  const reviewLines = lines.filter((line) => line.entry_date <= latestCountDate);
  if (reviewLines.length === 0) return { latestCountDate, rows: [] as StockOutCountReviewRow[] };

  const [shortfalls, { data: products, error: productsError }] = await Promise.all([
    getCountShortfalls(supabase, companyId, branchId, { allProducts: true }),
    supabase
      .from("products")
      .select("id, is_set")
      .in("id", [...new Set(reviewLines.map((line) => line.product_id))]),
  ]);
  if (productsError) throw productsError;
  const bundleIds = new Set((products ?? []).filter((product) => product.is_set).map((product) => product.id));

  const rows = reviewLines.map((line): StockOutCountReviewRow => {
    const count = confirmed.find((candidate) => candidate.count_date >= line.entry_date) ?? null;
    const shortfall =
      shortfalls.find((row) => row.txnId === line.linked_count_txn_id) ??
      (count ? shortfalls.find((row) => row.countId === count.id && row.productId === line.product_id) : undefined);
    const covered = line.linked_count_txn_id ? Number(line.linked_quantity ?? 0) : 0;
    return {
      entryId: line.id,
      productId: line.product_id,
      label: line.label,
      sku: line.sku,
      openDate: line.entry_date,
      quantity: Number(line.quantity_used),
      isBundle: bundleIds.has(line.product_id),
      coveredQuantity: covered,
      countId: shortfall?.countId ?? count?.id ?? null,
      countDate: shortfall?.countDate ?? count?.count_date ?? null,
      shortfallTxnId: shortfall?.txnId ?? null,
      coverable: shortfall ? Math.min(Number(line.quantity_used), shortfall.remaining + covered) : 0,
    };
  });
  return { latestCountDate, rows };
}

/** The salons' first trading day — the first stock-out period starts here. */
export const SALON_OPENING_DATE = "2026-06-01";

/**
 * The period a stock-out may cover. Stock-outs run back to back so in-house
 * use can't be logged twice: a new one starts the day after the latest
 * one's end date (or on the salon's opening day) and can run to today. An
 * existing one keeps its start, and its end can't reach the next one's start.
 */
export async function getStockOutPeriodBounds(
  supabase: Client,
  companyId: string,
  branchId: string,
  reportId?: string,
) {
  const today = singaporeToday();
  const { data, error } = await supabase
    .from("stock_out_reports")
    .select("id, period_start, entry_date")
    .eq("company_id", companyId)
    .eq("branch_id", branchId);
  if (error) throw error;
  const reports = (data ?? []).map((report) => ({
    id: report.id,
    start: report.period_start ?? report.entry_date,
    end: report.entry_date,
  }));

  if (!reportId) {
    const latestEnd = reports.reduce<string | null>((latest, report) => (!latest || report.end > latest ? report.end : latest), null);
    return { start: latestEnd ? addDays(latestEnd, 1) : SALON_OPENING_DATE, maxEnd: today, hasLater: false };
  }

  const report = reports.find((candidate) => candidate.id === reportId);
  if (!report) throw new Error("Stock-out not found.");
  const others = reports.filter((candidate) => candidate.id !== reportId);
  const previousEnd = others
    .filter((candidate) => candidate.end < report.start)
    .reduce<string | null>((latest, candidate) => (!latest || candidate.end > latest ? candidate.end : latest), null);
  const nextStart = others
    .filter((candidate) => candidate.start > report.end)
    .reduce<string | null>((earliest, candidate) => (!earliest || candidate.start < earliest ? candidate.start : earliest), null);
  const start = report.start ?? (previousEnd ? addDays(previousEnd, 1) : SALON_OPENING_DATE);
  const maxEnd = nextStart && addDays(nextStart, -1) < today ? addDays(nextStart, -1) : today;
  // With a later stock-out after it, its end date is fixed and it can't be
  // deleted: either would leave days no stock-out can cover.
  return { start, maxEnd, hasLater: nextStart != null };
}
