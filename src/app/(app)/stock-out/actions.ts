"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { getCountShortfalls } from "@/lib/data/product-sales";
import { getStockOutCountReview, getStockOutPeriodBounds } from "@/lib/data/stock-out";
import { formatDate } from "@/lib/format";
import { insertUsageLedgerRows, USE_RECLASS_NOTE } from "@/lib/data/usage-ledger";
import { createAdminClient } from "@/lib/supabase/admin";

// Stock-out is in-house use only — retail sales are recorded in /product-sales.
type StockOutType = "retail" | "inhouse";
const STOCK_OUT_TYPE: StockOutType = "inhouse";

function revalidateStockOut(reportId?: string) {
  revalidatePath("/stock-out");
  revalidatePath("/home");
  if (reportId) revalidatePath(`/stock-out/${reportId}`);
}

type Client = Awaited<ReturnType<typeof requireBranch>>["supabase"];

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function uploadStockOutAttachment(companyId: string, reportId: string, file: File) {
  const extension = ATTACHMENT_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("Attachment must be a PNG, JPEG, or WEBP image.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment must be smaller than 10 MB.");
  }
  const admin = createAdminClient();
  const path = `${companyId}/${reportId}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from("stock-out-attachments")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message || "Could not upload the attachment.");
  const { data: publicUrlData } = admin.storage.from("stock-out-attachments").getPublicUrl(path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

/**
 * A stock-out's period runs from its start (fixed by the stock-out before
 * it) to the end date the user picks, no later than `maxEnd`; every line's
 * open date has to fall inside it, so no day's use is logged twice.
 */
function assertWithinPeriod(
  bounds: { start: string; maxEnd: string },
  endDate: string,
  lineDates: string[],
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Enter a valid end date.");
  if (endDate < bounds.start) {
    throw new Error(`The end date can't be before the period start, ${formatDate(bounds.start)}.`);
  }
  if (endDate > bounds.maxEnd) {
    throw new Error(`The end date can't be after ${formatDate(bounds.maxEnd)}.`);
  }
  for (const lineDate of lineDates) {
    if (!lineDate) throw new Error("Each line needs an open date.");
    if (lineDate < bounds.start || lineDate > endDate) {
      throw new Error(
        `Open dates have to be between ${formatDate(bounds.start)} and ${formatDate(endDate)} — this stock-out's period.`,
      );
    }
  }
}

// Writes every line of a stock-out report in one pass: a single
// retail_use_entries insert, then the shared batched ledger write.
async function insertStockOutLines(
  supabase: Client,
  input: {
    companyId: string;
    branchId: string;
    storeLocationId: string;
    userEmail: string | undefined;
    reportId: string;
    notes: string | null;
    type: StockOutType;
    lines: { productId: string; quantityUsed: number; entryDate: string }[];
  },
) {
  if (input.lines.length === 0) return;

  const entries = input.lines.map((line) => ({ ...line, entryId: randomUUID() }));

  const { error: entriesError } = await supabase.from("retail_use_entries").insert(
    entries.map((entry) => ({
      id: entry.entryId,
      company_id: input.companyId,
      branch_id: input.branchId,
      product_id: entry.productId,
      store_location_id: input.storeLocationId,
      quantity_used: entry.quantityUsed,
      entry_date: entry.entryDate,
      keyed_in_by: input.userEmail,
      notes: input.notes,
      stock_out_report_id: input.reportId,
    })),
  );
  if (entriesError) throw entriesError;

  await insertUsageLedgerRows(supabase, {
    companyId: input.companyId,
    branchId: input.branchId,
    storeLocationId: input.storeLocationId,
    userEmail: input.userEmail,
    // Stock-out is Pulse's own manual entry, not a POS-tracked sale — it's
    // always inhouse_use. Genuine POS sales are entered on /product-sales,
    // which writes retail_use.
    txnType: "inhouse_use",
    classification: input.type,
    referenceTable: "retail_use_entries",
    baseNote: input.notes ?? `Stock-out (${input.type})`,
    lines: entries.map((entry) => ({
      referenceId: entry.entryId,
      productId: entry.productId,
      quantity: entry.quantityUsed,
      entryDate: entry.entryDate,
    })),
  });
}

/** Replays one product's cost at this salon — needed after ledger rows are deleted (the trigger only fires on insert). */
async function recomputeCosts(supabase: Client, companyId: string, branchId: string, productIds: string[]) {
  for (const productId of new Set(productIds)) {
    const { error } = await supabase.rpc("fn_recompute_branch_cost", {
      p_company_id: companyId,
      p_product_id: productId,
      p_branch_id: branchId,
    });
    if (error) throw new Error(error.message || "Could not update product costs.");
  }
}

/**
 * Deletes a report's lines and every ledger row they wrote (deductions and
 * any count reclassifications), then replays cost for the products touched.
 */
async function clearReportLines(supabase: Client, companyId: string, branchId: string, reportId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("retail_use_entries")
    .select("id")
    .eq("stock_out_report_id", reportId);
  if (existingError) throw existingError;

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length === 0) return;

  const { data: removed, error: deleteTxnError } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("reference_table", "retail_use_entries")
    .in("reference_id", existingIds)
    .select("product_id");
  if (deleteTxnError) throw deleteTxnError;

  const { error: deleteEntriesError } = await supabase
    .from("retail_use_entries")
    .delete()
    .in("id", existingIds);
  if (deleteEntriesError) throw deleteEntriesError;

  await recomputeCosts(
    supabase,
    companyId,
    branchId,
    (removed ?? []).map((row) => row.product_id),
  );
}

export async function recordStockOutReport(
  input: {
    branch_id: string;
    entry_date: string;
    notes: string;
    lines: { product_id: string; quantity_used: number; entry_date: string }[];
  },
  attachmentFile?: File | null,
) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  const lines = input.lines.filter((line) => line.product_id && line.quantity_used > 0);
  if (lines.length === 0) {
    throw new Error("Add at least one line with a product and quantity.");
  }

  const storeLocationId = await getDefaultStoreLocationId(supabase, branch.id);
  const entryDate = input.entry_date || new Date().toISOString().slice(0, 10);
  const notes = input.notes.trim() || null;
  const bounds = await getStockOutPeriodBounds(supabase, companyId, branch.id);
  if (bounds.start > bounds.maxEnd) {
    throw new Error(`The last stock-out already covers up to today — the next one can start on ${formatDate(bounds.start)}.`);
  }
  assertWithinPeriod(
    bounds,
    entryDate,
    lines.map((line) => line.entry_date),
  );

  const { data: report, error: reportError } = await supabase
    .from("stock_out_reports")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      channel: STOCK_OUT_TYPE,
      period_start: bounds.start,
      entry_date: entryDate,
      notes,
      keyed_in_by: user.email,
    })
    .select("id")
    .single();
  if (reportError || !report) throw reportError ?? new Error("Could not create the stock-out.");

  if (attachmentFile && attachmentFile.size > 0) {
    const attachmentUrl = await uploadStockOutAttachment(companyId, report.id, attachmentFile);
    const { error: attachError } = await supabase
      .from("stock_out_reports")
      .update({ attachment_url: attachmentUrl })
      .eq("id", report.id);
    if (attachError) throw attachError;
  }

  await insertStockOutLines(supabase, {
    companyId,
    branchId: branch.id,
    storeLocationId,
    userEmail: user.email,
    reportId: report.id,
    notes,
    type: STOCK_OUT_TYPE,
    lines: lines.map((line) => ({
      productId: line.product_id,
      quantityUsed: line.quantity_used,
      entryDate: line.entry_date,
    })),
  });

  revalidateStockOut(report.id);
  redirect(`/stock-out/${report.id}`);
}

export async function updateStockOutReport(
  input: {
    report_id: string;
    entry_date: string;
    notes: string;
    lines: { product_id: string; quantity_used: number; entry_date: string }[];
  },
  attachmentFile?: File | null,
) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");
  const lines = input.lines.filter((line) => line.product_id && line.quantity_used > 0);
  if (lines.length === 0) {
    throw new Error("Add at least one line with a product and quantity.");
  }

  const { data: report, error: reportError } = await supabase
    .from("stock_out_reports")
    .select("id")
    .eq("id", input.report_id)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (reportError || !report) throw reportError ?? new Error("Stock-out not found.");

  const storeLocationId = await getDefaultStoreLocationId(supabase, branch.id);
  const entryDate = input.entry_date || new Date().toISOString().slice(0, 10);
  const notes = input.notes.trim() || null;
  const bounds = await getStockOutPeriodBounds(supabase, companyId, branch.id, report.id);
  assertWithinPeriod(
    bounds,
    entryDate,
    lines.map((line) => line.entry_date),
  );

  await clearReportLines(supabase, companyId, branch.id, report.id);

  const patch: {
    channel: StockOutType;
    period_start: string;
    entry_date: string;
    notes: string | null;
    attachment_url?: string;
  } = {
    channel: STOCK_OUT_TYPE,
    period_start: bounds.start,
    entry_date: entryDate,
    notes,
  };
  if (attachmentFile && attachmentFile.size > 0) {
    patch.attachment_url = await uploadStockOutAttachment(companyId, report.id, attachmentFile);
  }

  const { error: updateError } = await supabase.from("stock_out_reports").update(patch).eq("id", report.id);
  if (updateError) throw updateError;

  await insertStockOutLines(supabase, {
    companyId,
    branchId: branch.id,
    storeLocationId,
    userEmail: user.email,
    reportId: report.id,
    notes,
    type: STOCK_OUT_TYPE,
    lines: lines.map((line) => ({
      productId: line.product_id,
      quantityUsed: line.quantity_used,
      entryDate: line.entry_date,
    })),
  });

  revalidateStockOut(report.id);
}

export async function deleteStockOutReport(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const reportId = String(formData.get("report_id") ?? "");

  const { data: report, error: reportError } = await supabase
    .from("stock_out_reports")
    .select("id")
    .eq("id", reportId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (reportError || !report) throw reportError ?? new Error("Stock-out not found.");

  await clearReportLines(supabase, companyId, branch.id, report.id);

  const { error: deleteError } = await supabase.from("stock_out_reports").delete().eq("id", report.id);
  if (deleteError) throw deleteError;

  revalidateStockOut();
  redirect("/stock-out");
}

/**
 * For a stock-out line opened on or before a confirmed count: `covered`
 * marks its units as already counted in that count's shortfall (they were
 * this in-house use), so they're added back on the count's date and stock
 * only drops once — the cost moves from count shortfall to in-house use.
 * Unmarking makes it an extra deduction again. Covers as many units as the
 * shortfall has left, up to the line's quantity.
 */
export async function setStockOutLineCovered(entryId: string, covered: boolean) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");

  const { data: entry, error: entryError } = await supabase
    .from("retail_use_entries")
    .select("id, product_id, quantity_used, entry_date, stock_out_report_id, linked_count_txn_id, linked_quantity, products(sku, name, order_name)")
    .eq("id", entryId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (entryError || !entry) throw new Error("Stock-out line not found.");

  // Start from an extra deduction: drop any existing reclassification and link.
  if (entry.linked_count_txn_id) {
    const { error: deleteError } = await supabase
      .from("inventory_transactions")
      .delete()
      .eq("reference_table", "retail_use_entries")
      .eq("reference_id", entry.id)
      .eq("notes", USE_RECLASS_NOTE);
    if (deleteError) throw deleteError;
    const { error: unlinkError } = await supabase
      .from("retail_use_entries")
      .update({ linked_count_txn_id: null, linked_quantity: null })
      .eq("id", entry.id);
    if (unlinkError) throw unlinkError;
    if (!covered) await recomputeCosts(supabase, companyId, branch.id, [entry.product_id]);
  }

  if (covered) {
    const { rows } = await getStockOutCountReview(supabase, companyId, branch.id, [
      {
        id: entry.id,
        product_id: entry.product_id,
        quantity_used: Number(entry.quantity_used),
        entry_date: entry.entry_date,
        linked_count_txn_id: null,
        linked_quantity: null,
        label: "",
        sku: null,
      },
    ]);
    const review = rows[0];
    if (!review) throw new Error("This line wasn't opened on or before a confirmed count.");
    if (review.isBundle) throw new Error("Bundle lines can't be covered by a count — their contents are what was counted.");
    if (!review.shortfallTxnId || review.coverable <= 0) {
      throw new Error("That count has no shortfall left for this product to cover the line.");
    }
    const [shortfall] = await getCountShortfalls(supabase, companyId, branch.id, { txnIds: [review.shortfallTxnId] });
    if (!shortfall) throw new Error("That count shortfall is no longer available.");

    const { error: reclassError } = await supabase.from("inventory_transactions").insert({
      company_id: companyId,
      product_id: entry.product_id,
      store_location_id: shortfall.storeLocationId,
      txn_type: "count_adjustment",
      quantity_change: review.coverable,
      reference_table: "retail_use_entries",
      reference_id: entry.id,
      created_by: user.email,
      notes: USE_RECLASS_NOTE,
      unit_cost: shortfall.unitCost,
      txn_date: shortfall.txnDate,
    });
    if (reclassError) throw reclassError;
    const { error: linkError } = await supabase
      .from("retail_use_entries")
      .update({ linked_count_txn_id: shortfall.txnId, linked_quantity: review.coverable })
      .eq("id", entry.id);
    if (linkError) throw linkError;
  }

  revalidateStockOut(entry.stock_out_report_id ?? undefined);
  revalidatePath("/reports/monthly-inventory");
}
