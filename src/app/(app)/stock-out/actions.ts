"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { insertUsageLedgerRows } from "@/lib/data/usage-ledger";
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

function assertLineDateWithinReport(lineDate: string, reportDate: string) {
  if (!lineDate) throw new Error("Each line needs an open date.");
  if (lineDate > reportDate) throw new Error("A line's open date cannot be after the stock-out date.");
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

async function clearReportLines(supabase: Client, reportId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("retail_use_entries")
    .select("id")
    .eq("stock_out_report_id", reportId);
  if (existingError) throw existingError;

  const existingIds = (existing ?? []).map((row) => row.id);
  if (existingIds.length === 0) return;

  const { error: deleteTxnError } = await supabase
    .from("inventory_transactions")
    .delete()
    .eq("reference_table", "retail_use_entries")
    .in("reference_id", existingIds);
  if (deleteTxnError) throw deleteTxnError;

  const { error: deleteEntriesError } = await supabase
    .from("retail_use_entries")
    .delete()
    .in("id", existingIds);
  if (deleteEntriesError) throw deleteEntriesError;
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
  for (const line of lines) assertLineDateWithinReport(line.entry_date, entryDate);

  const { data: report, error: reportError } = await supabase
    .from("stock_out_reports")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      channel: STOCK_OUT_TYPE,
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
  for (const line of lines) assertLineDateWithinReport(line.entry_date, entryDate);

  await clearReportLines(supabase, report.id);

  const patch: { channel: StockOutType; entry_date: string; notes: string | null; attachment_url?: string } = {
    channel: STOCK_OUT_TYPE,
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

  await clearReportLines(supabase, report.id);

  const { error: deleteError } = await supabase.from("stock_out_reports").delete().eq("id", report.id);
  if (deleteError) throw deleteError;

  revalidateStockOut();
  redirect("/stock-out");
}
