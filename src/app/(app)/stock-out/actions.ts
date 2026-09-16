"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { getBundleComponents } from "@/lib/data/product-components";
import { businessTxnDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type StockOutType = "retail" | "inhouse";

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
  if (!lineDate) throw new Error("Each line needs a use date.");
  if (lineDate > reportDate) throw new Error("A line's use date cannot be after the stock-out date.");
}

async function insertStockOutLine(
  supabase: Client,
  input: {
    companyId: string;
    branchId: string;
    storeLocationId: string;
    userEmail: string | undefined;
    reportId: string;
    entryDate: string;
    notes: string | null;
    productId: string;
    quantityUsed: number;
    type: StockOutType;
  },
) {
  const { data: entry, error } = await supabase
    .from("retail_use_entries")
    .insert({
      company_id: input.companyId,
      branch_id: input.branchId,
      product_id: input.productId,
      store_location_id: input.storeLocationId,
      quantity_used: input.quantityUsed,
      entry_date: input.entryDate,
      keyed_in_by: input.userEmail,
      notes: input.notes,
      stock_out_report_id: input.reportId,
    })
    .select("id")
    .single();

  if (error || !entry) throw error ?? new Error("Could not save the stock-out entry.");

  const qtyUsed = Math.abs(input.quantityUsed);
  const components = await getBundleComponents(supabase, input.productId);

  // A bundle SKU never carries its own stock/cost (mirrors receiving — see
  // fn_after_goods_receipt_item_insert): using it fans out to deduct each
  // component by its recipe quantity, costed at the component's own current
  // average. Nothing is written against the bundle's own product_id.
  const lines =
    components.length > 0
      ? components.map((component) => ({
          productId: component.productId,
          quantity: qtyUsed * component.quantity,
          notes: `${input.notes ?? `Stock-out (${input.type})`} (unpacked from bundle usage)`,
        }))
      : [{ productId: input.productId, quantity: qtyUsed, notes: input.notes ?? `Stock-out (${input.type})` }];

  const { data: costs } = await supabase
    .from("product_branch_costs")
    .select("product_id, avg_unit_cost")
    .eq("branch_id", input.branchId)
    .in(
      "product_id",
      lines.map((line) => line.productId),
    );
  const costByProduct = new Map((costs ?? []).map((row) => [row.product_id, row.avg_unit_cost]));

  const txnDate = businessTxnDate(input.entryDate);
  const { error: txnError } = await supabase.from("inventory_transactions").insert(
    lines.map((line) => ({
      company_id: input.companyId,
      product_id: line.productId,
      store_location_id: input.storeLocationId,
      txn_type: "retail_use" as const,
      quantity_change: -line.quantity,
      reference_table: "retail_use_entries",
      reference_id: entry.id,
      created_by: input.userEmail,
      notes: line.notes,
      unit_cost: costByProduct.get(line.productId) ?? 0,
      classification: input.type,
      txn_date: txnDate,
    })),
  );

  if (txnError) throw txnError;
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
    type: StockOutType;
    entry_date: string;
    notes: string;
    lines: { product_id: string; quantity_used: number; entry_date: string }[];
  },
  attachmentFile?: File | null,
) {
  const { supabase, companyId, user, branch } = await requireBranch();
  if (input.branch_id && input.branch_id !== branch.id) {
    throw new Error("The form is for a different salon. Switch branch and try again.");
  }
  if (input.type !== "retail" && input.type !== "inhouse") {
    throw new Error("Select a type before adding lines.");
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
      channel: input.type,
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

  for (const line of lines) {
    await insertStockOutLine(supabase, {
      companyId,
      branchId: branch.id,
      storeLocationId,
      userEmail: user.email,
      reportId: report.id,
      entryDate: line.entry_date,
      notes,
      productId: line.product_id,
      quantityUsed: line.quantity_used,
      type: input.type,
    });
  }

  revalidateStockOut(report.id);
  redirect(`/stock-out/${report.id}`);
}

export async function updateStockOutReport(
  input: {
    report_id: string;
    type: StockOutType;
    entry_date: string;
    notes: string;
    lines: { product_id: string; quantity_used: number; entry_date: string }[];
  },
  attachmentFile?: File | null,
) {
  const { supabase, companyId, user, branch } = await requireBranch();
  if (input.type !== "retail" && input.type !== "inhouse") {
    throw new Error("Select a type before adding lines.");
  }
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
    channel: input.type,
    entry_date: entryDate,
    notes,
  };
  if (attachmentFile && attachmentFile.size > 0) {
    patch.attachment_url = await uploadStockOutAttachment(companyId, report.id, attachmentFile);
  }

  const { error: updateError } = await supabase.from("stock_out_reports").update(patch).eq("id", report.id);
  if (updateError) throw updateError;

  for (const line of lines) {
    await insertStockOutLine(supabase, {
      companyId,
      branchId: branch.id,
      storeLocationId,
      userEmail: user.email,
      reportId: report.id,
      entryDate: line.entry_date,
      notes,
      productId: line.product_id,
      quantityUsed: line.quantity_used,
      type: input.type,
    });
  }

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
