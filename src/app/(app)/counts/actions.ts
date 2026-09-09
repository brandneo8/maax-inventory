"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { chunkList, queryError, resolveCountItems } from "@/lib/data/counts";
import type { ProductClassification } from "@/lib/labels";

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function createInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const storeLocationId = emptyToNull(formData.get("store_location_id"));
  const filterBrandId = emptyToNull(formData.get("filter_brand_id"));
  const filterClassification = emptyToNull(formData.get("filter_classification")) as
    | ProductClassification
    | null;
  const filterTagId = emptyToNull(formData.get("filter_tag_id"));
  const countDate = String(formData.get("count_date") ?? "") || new Date().toISOString().slice(0, 10);

  const items = await resolveCountItems(supabase, companyId, branch.id, {
    store_location_id: storeLocationId,
    filter_brand_id: filterBrandId,
    filter_classification: filterClassification,
    filter_tag_id: filterTagId,
  });

  const { data: count, error } = await supabase
    .from("inventory_counts")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      store_location_id: storeLocationId,
      filter_brand_id: filterBrandId,
      filter_classification: filterClassification,
      filter_tag_id: filterTagId,
      status: "in_progress",
      count_date: countDate,
      counted_by: user.email,
    })
    .select("id")
    .single();

  if (error || !count) throw queryError(error, "Could not start the count.");

  for (const batch of chunkList(
    items.map((item) => ({
      inventory_count_id: count.id,
      product_id: item.product_id,
      store_location_id: item.store_location_id,
      expected_quantity: item.expected_quantity,
    })),
  )) {
    const { error: itemsError } = await supabase.from("inventory_count_items").insert(batch);
    if (itemsError) {
      await supabase.from("inventory_counts").delete().eq("id", count.id);
      throw queryError(itemsError, "Could not create count lines.");
    }
  }

  revalidatePath("/counts");
  redirect(`/counts/${count.id}`);
}

export async function saveCountQuantities(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");

  const items: { id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: itemsError } = await supabase
      .from("inventory_count_items")
      .select("id")
      .eq("inventory_count_id", count.id)
      .order("id")
      .range(from, from + 999);
    if (itemsError) throw queryError(itemsError, "Could not load count lines.");
    items.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  for (const item of items ?? []) {
    const raw = formData.get(`counted:${item.id}`);
    if (raw === null || String(raw) === "") continue;
    const { error } = await supabase
      .from("inventory_count_items")
      .update({ counted_quantity: Number(raw) })
      .eq("id", item.id);
    if (error) throw queryError(error, "Could not save counted quantities.");
  }

  revalidatePath(`/counts/${count.id}`);
}

export async function completeInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");

  const items: {
    id: string;
    product_id: string;
    store_location_id: string;
    counted_quantity: number | null;
    variance: number | null;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: itemsError } = await supabase
      .from("inventory_count_items")
      .select("id, product_id, store_location_id, counted_quantity, variance")
      .eq("inventory_count_id", count.id)
      .order("id")
      .range(from, from + 999);
    if (itemsError) throw queryError(itemsError, "Could not load count lines.");
    items.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  if (items.some((item) => item.counted_quantity === null)) {
    throw new Error("Enter a counted quantity for every line before completing.");
  }

  const adjustments = items.filter((item) => Number(item.variance ?? 0) !== 0);
  for (const batch of chunkList(adjustments)) {
    const { error } = await supabase.from("inventory_transactions").insert(
      batch.map((item) => ({
        company_id: companyId,
        product_id: item.product_id,
        store_location_id: item.store_location_id,
        txn_type: "count_adjustment" as const,
        quantity_change: Number(item.variance),
        reference_table: "inventory_count_items",
        reference_id: item.id,
        created_by: user.email,
        notes: "Count variance",
      })),
    );
    if (error) throw queryError(error, "Could not post count variances.");
  }

  const { error: statusError } = await supabase
    .from("inventory_counts")
    .update({ status: "completed" })
    .eq("id", count.id);
  if (statusError) throw queryError(statusError, "Could not complete the count.");

  revalidatePath(`/counts/${count.id}`);
  revalidatePath("/counts");
  revalidatePath("/reports");
}
