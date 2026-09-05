"use server";

import { revalidatePath } from "next/cache";
import { requireBranch, requireUser } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";

async function recordRetailUse(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  input: {
    companyId: string;
    userEmail: string;
    branchId: string;
    productId: string;
    storeLocationId: string;
    quantityUsed: number;
    entryDate: string;
    externalReference: string | null;
    notes: string | null;
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
      external_reference: input.externalReference,
      keyed_in_by: input.userEmail,
      notes: input.notes,
    })
    .select("id")
    .single();

  if (error || !entry) throw error ?? new Error("Could not save the retail-use entry.");

  const { error: txnError } = await supabase.from("inventory_transactions").insert({
    company_id: input.companyId,
    product_id: input.productId,
    store_location_id: input.storeLocationId,
    txn_type: "retail_use",
    quantity_change: -Math.abs(input.quantityUsed),
    reference_table: "retail_use_entries",
    reference_id: entry.id,
    created_by: input.userEmail,
    notes: input.notes ?? "Retail use from external sales report",
  });

  if (txnError) throw txnError;
}

export async function createRetailUseEntry(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  await recordRetailUse(supabase, {
    companyId,
    userEmail: user.email ?? "",
    branchId: branch.id,
    productId: String(formData.get("product_id") ?? ""),
    storeLocationId: String(formData.get("store_location_id") ?? ""),
    quantityUsed: Number(formData.get("quantity_used") ?? 0),
    entryDate: String(formData.get("entry_date") ?? ""),
    externalReference: String(formData.get("external_reference") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  revalidatePath("/import");
}

export async function importRetailUseCsv(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a CSV or Excel-exported CSV file.");
  }

  const [products, locations] = await Promise.all([
    supabase.from("products").select("id, sku").eq("company_id", companyId),
    supabase.from("store_locations").select("id, name, branch_id").eq("branch_id", branch.id),
  ]);

  if (products.error) throw products.error;
  if (locations.error) throw locations.error;

  const productBySku = new Map(
    (products.data ?? []).map((product) => [product.sku.trim().toLowerCase(), product.id]),
  );
  const locationByName = new Map(
    (locations.data ?? []).map((location) => [location.name.trim().toLowerCase(), location.id]),
  );

  const rows = parseCsv(await file.text());
  if (rows.length === 0) {
    throw new Error("The file has no data rows.");
  }

  let imported = 0;
  const problems: string[] = [];

  for (const [index, row] of rows.entries()) {
    const sku = (row["sku"] ?? "").toLowerCase();
    const locationName = (row["location"] ?? "stock room").toLowerCase();
    const quantityUsed = Number(row["quantity_used"] ?? row["qty"] ?? 0);
    const entryDate = row["entry_date"] || row["date"] || new Date().toISOString().slice(0, 10);
    const line = index + 2;

    const productId = productBySku.get(sku);
    const storeLocationId = locationByName.get(locationName);

    if (!productId || !storeLocationId || !(quantityUsed > 0)) {
      problems.push(`Row ${line}: check sku, location, and quantity_used.`);
      continue;
    }

    await recordRetailUse(supabase, {
      companyId,
      userEmail: user.email ?? "",
      branchId: branch.id,
      productId,
      storeLocationId,
      quantityUsed,
      entryDate,
      externalReference: row["external_reference"] || row["reference"] || null,
      notes: row["notes"] || null,
    });
    imported += 1;
  }

  revalidatePath("/import");

  if (imported === 0) {
    throw new Error(problems[0] ?? "No rows could be imported.");
  }
}
