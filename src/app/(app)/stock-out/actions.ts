"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBranch } from "@/lib/auth";
import { assertNoActiveCount } from "@/lib/data/counts";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { getCountShortfalls } from "@/lib/data/product-sales";
import { getStockOutCountReview, getStockOutPeriodBounds } from "@/lib/data/stock-out";
import { formatDate, singaporeToday } from "@/lib/format";
import { buildUsageLedgerRows } from "@/lib/data/usage-ledger";
import { createAdminClient } from "@/lib/supabase/admin";

// Stock-out is in-house use only — retail sales are recorded in /product-sales.
type StockOutType = "retail" | "inhouse";
const STOCK_OUT_TYPE: StockOutType = "inhouse";

/**
 * What a stock-out action returns. Errors come back as values rather than
 * being thrown: Next.js hides thrown server-action messages in production,
 * so the person saving would only see a generic error.
 */
export type StockOutResult<T = object> = ({ ok: true; warning?: string } & T) | { ok: false; error: string };

function revalidateStockOut(reportId?: string) {
  revalidatePath("/stock-out");
  revalidatePath("/home");
  revalidatePath("/orders");
  revalidatePath("/reports/monthly-inventory");
  if (reportId) revalidatePath(`/stock-out/${reportId}`);
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message) {
    return err.message;
  }
  return fallback;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Checks an attachment before anything is saved, so a bad file never leaves a half-saved stock-out. */
function checkAttachment(file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  const extension = ATTACHMENT_MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("The attachment must be a PNG, JPEG or WEBP image.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("The attachment must be smaller than 10 MB.");
  return { file, extension };
}

/** Uploads a checked attachment and stores its link on the report. Returns a warning if it fails. */
async function attachToReport(
  supabase: Client,
  companyId: string,
  reportId: string,
  attachment: { file: File; extension: string },
) {
  try {
    const admin = createAdminClient();
    const path = `${companyId}/${reportId}.${attachment.extension}`;
    const { error: uploadError } = await admin.storage
      .from("stock-out-attachments")
      .upload(path, attachment.file, { upsert: true, contentType: attachment.file.type });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = admin.storage.from("stock-out-attachments").getPublicUrl(path);
    const { error } = await supabase
      .from("stock_out_reports")
      .update({ attachment_url: `${publicUrlData.publicUrl}?v=${Date.now()}` })
      .eq("id", reportId);
    if (error) throw error;
    return undefined;
  } catch (err) {
    return `The stock-out was saved, but the attachment couldn't be uploaded (${errorMessage(err, "upload failed")}). Edit it to try again.`;
  }
}

type Client = Awaited<ReturnType<typeof requireBranch>>["supabase"];

/**
 * Sends SQL null for an empty argument. The generated RPC types mark every
 * argument as required and non-null, but these functions take null (no
 * notes, no link) — and leaving the key out would make the call fail.
 */
function nullable<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}

type LineInput = { id?: string; product_id: string; quantity_used: number; entry_date: string };

/** Lines to save: every line needs a product, a whole quantity above zero and an open date. */
function checkLines(lines: LineInput[]) {
  if (lines.length === 0) throw new Error("Add at least one line with a product and quantity.");
  for (const line of lines) {
    if (!line.product_id) throw new Error("Each line needs a product.");
    if (!Number.isInteger(line.quantity_used) || line.quantity_used <= 0) {
      throw new Error("Each line needs a whole quantity above zero (remove lines you don't need).");
    }
  }
  return lines;
}

/**
 * A stock-out's period runs from its start (fixed by the stock-out before
 * it) to the end date the user picks, no later than `maxEnd`; every line's
 * open date has to fall inside it, so no day's use is logged twice.
 * (fn_save_stock_out repeats these checks inside its lock.)
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

/**
 * Writes a stock-out in one database transaction (fn_save_stock_out): the
 * report, its new lines and their stock deductions, and — on an edit — the
 * removal of the lines that changed. Lines kept exactly as they were keep
 * their ledger rows and count-coverage marks.
 */
async function saveStockOut(
  supabase: Client,
  input: {
    companyId: string;
    branchId: string;
    reportId: string;
    isNew: boolean;
    entryDate: string;
    notes: string | null;
    userEmail: string | undefined;
    storeLocationId: string;
    keepEntryIds: string[];
    newLines: { productId: string; quantityUsed: number; entryDate: string }[];
  },
) {
  const entries = input.newLines.map((line) => ({ ...line, entryId: randomUUID() }));
  const txns = await buildUsageLedgerRows(supabase, {
    branchId: input.branchId,
    // Stock-out is Pulse's own manual entry, not a POS-tracked sale — it's
    // always inhouse_use. Genuine POS sales are entered on /product-sales,
    // which writes retail_use.
    baseNote: input.notes ?? `Stock-out (${STOCK_OUT_TYPE})`,
    lines: entries.map((entry) => ({
      referenceId: entry.entryId,
      productId: entry.productId,
      quantity: entry.quantityUsed,
      entryDate: entry.entryDate,
    })),
  });

  const { error } = await supabase.rpc("fn_save_stock_out", {
    p_company_id: input.companyId,
    p_branch_id: input.branchId,
    p_report_id: input.reportId,
    p_is_new: input.isNew,
    p_entry_date: input.entryDate,
    p_notes: nullable(input.notes),
    p_user: nullable(input.userEmail),
    p_store_location_id: input.storeLocationId,
    p_keep_entry_ids: input.keepEntryIds,
    p_entries: entries.map((entry) => ({
      id: entry.entryId,
      product_id: entry.productId,
      quantity_used: entry.quantityUsed,
      entry_date: entry.entryDate,
    })),
    p_txns: txns.map((row) => ({
      reference_id: row.referenceId,
      product_id: row.productId,
      quantity_change: row.quantityChange,
      notes: row.notes,
      unit_cost: row.unitCost,
      txn_date: row.txnDate,
    })),
  });
  if (error) throw new Error(error.message || "Could not save this stock-out.");
}

export async function recordStockOutReport(
  input: {
    branch_id: string;
    entry_date: string;
    notes: string;
    lines: LineInput[];
  },
  attachmentFile?: File | null,
): Promise<StockOutResult<{ reportId: string }>> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();
    if (input.branch_id && input.branch_id !== branch.id) {
      throw new Error("The form is for a different salon. Switch branch and try again.");
    }
    const lines = checkLines(input.lines);
    const attachment = checkAttachment(attachmentFile);
    await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");

    const [storeLocationId, bounds] = await Promise.all([
      getDefaultStoreLocationId(supabase, branch.id),
      getStockOutPeriodBounds(supabase, companyId, branch.id),
    ]);
    const entryDate = input.entry_date || singaporeToday();
    if (bounds.start > bounds.maxEnd) {
      throw new Error(`The last stock-out already covers up to today — the next one can start on ${formatDate(bounds.start)}.`);
    }
    assertWithinPeriod(bounds, entryDate, lines.map((line) => line.entry_date));

    const reportId = randomUUID();
    const notes = input.notes.trim() || null;
    await saveStockOut(supabase, {
      companyId,
      branchId: branch.id,
      reportId,
      isNew: true,
      entryDate,
      notes,
      userEmail: user.email,
      storeLocationId,
      keepEntryIds: [],
      newLines: lines.map((line) => ({
        productId: line.product_id,
        quantityUsed: line.quantity_used,
        entryDate: line.entry_date,
      })),
    });

    const warning = attachment ? await attachToReport(supabase, companyId, reportId, attachment) : undefined;
    revalidateStockOut(reportId);
    return { ok: true, reportId, warning };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save this stock-out.") };
  }
}

export async function updateStockOutReport(
  input: {
    report_id: string;
    entry_date: string;
    notes: string;
    /** Saved lines carry their id; lines left unchanged keep their count-coverage marks. */
    lines: LineInput[];
  },
  attachmentFile?: File | null,
): Promise<StockOutResult> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();
    const lines = checkLines(input.lines);
    const attachment = checkAttachment(attachmentFile);
    await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");

    const [{ data: report, error: reportError }, { data: existing, error: existingError }, storeLocationId, bounds] =
      await Promise.all([
        supabase
          .from("stock_out_reports")
          .select("id")
          .eq("id", input.report_id)
          .eq("company_id", companyId)
          .eq("branch_id", branch.id)
          .maybeSingle(),
        supabase
          .from("retail_use_entries")
          .select("id, product_id, quantity_used, entry_date")
          .eq("stock_out_report_id", input.report_id),
        getDefaultStoreLocationId(supabase, branch.id),
        getStockOutPeriodBounds(supabase, companyId, branch.id, input.report_id),
      ]);
    if (reportError) throw reportError;
    if (existingError) throw existingError;
    if (!report) throw new Error("Stock-out not found.");

    const entryDate = input.entry_date || singaporeToday();
    assertWithinPeriod(bounds, entryDate, lines.map((line) => line.entry_date));

    // A saved line sent back unchanged is kept as it is; anything else is rewritten.
    const savedById = new Map((existing ?? []).map((row) => [row.id, row]));
    const keepEntryIds: string[] = [];
    const newLines: { productId: string; quantityUsed: number; entryDate: string }[] = [];
    for (const line of lines) {
      const saved = line.id ? savedById.get(line.id) : undefined;
      if (
        saved &&
        !keepEntryIds.includes(saved.id) &&
        saved.product_id === line.product_id &&
        Number(saved.quantity_used) === line.quantity_used &&
        saved.entry_date === line.entry_date
      ) {
        keepEntryIds.push(saved.id);
      } else {
        newLines.push({ productId: line.product_id, quantityUsed: line.quantity_used, entryDate: line.entry_date });
      }
    }

    await saveStockOut(supabase, {
      companyId,
      branchId: branch.id,
      reportId: report.id,
      isNew: false,
      entryDate,
      notes: input.notes.trim() || null,
      userEmail: user.email,
      storeLocationId,
      keepEntryIds,
      newLines,
    });

    const warning = attachment ? await attachToReport(supabase, companyId, report.id, attachment) : undefined;
    revalidateStockOut(report.id);
    return { ok: true, warning };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save changes.") };
  }
}

/** Deletes a stock-out (only the latest one) and reverses its stock deduction, in one transaction. */
export async function deleteStockOutReport(reportId: string): Promise<StockOutResult> {
  try {
    const { supabase, companyId, branch } = await requireBranch();
    await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");
    const { error } = await supabase.rpc("fn_delete_stock_out", {
      p_company_id: companyId,
      p_branch_id: branch.id,
      p_report_id: reportId,
    });
    if (error) throw new Error(error.message || "Could not delete this stock-out.");
    revalidateStockOut();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not delete this stock-out.") };
  }
}

/**
 * For a stock-out line opened on or before a confirmed count: `covered`
 * marks its units as already counted in that count's shortfall (they were
 * this in-house use), so they're added back on the count's date and stock
 * only drops once — the cost moves from count shortfall to in-house use.
 * Unmarking makes it an extra deduction again. Covers as many units as the
 * shortfall has left, up to the line's quantity. Written in one transaction
 * (fn_set_stock_out_line_link), which always clears an earlier
 * reclassification first so units can't be added back twice.
 */
export async function setStockOutLineCovered(entryId: string, covered: boolean): Promise<StockOutResult> {
  try {
    const { supabase, companyId, user, branch } = await requireBranch();
    await assertNoActiveCount(supabase, companyId, branch.id, "record stock-out");

    const { data: entry, error: entryError } = await supabase
      .from("retail_use_entries")
      .select("id, product_id, quantity_used, entry_date, stock_out_report_id")
      .eq("id", entryId)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .maybeSingle();
    if (entryError) throw entryError;
    if (!entry) throw new Error("Stock-out line not found.");

    let link: { txnId: string; quantity: number; unitCost: number; txnDate: string; storeLocationId: string } | null =
      null;
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
      link = {
        txnId: shortfall.txnId,
        quantity: review.coverable,
        unitCost: shortfall.unitCost,
        txnDate: shortfall.txnDate,
        storeLocationId: shortfall.storeLocationId,
      };
    }

    const { error } = await supabase.rpc("fn_set_stock_out_line_link", {
      p_company_id: companyId,
      p_branch_id: branch.id,
      p_entry_id: entry.id,
      p_link_txn_id: nullable(link?.txnId),
      p_quantity: nullable(link?.quantity),
      p_unit_cost: nullable(link?.unitCost),
      p_txn_date: nullable(link?.txnDate),
      p_store_location_id: nullable(link?.storeLocationId),
      p_user: nullable(user.email),
    });
    if (error) throw new Error(error.message || "Could not update this line.");

    revalidateStockOut(entry.stock_out_report_id ?? undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not update this line.") };
  }
}
