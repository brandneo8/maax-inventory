"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import {
  addCountEntry,
  assignProductsToSalon,
  chunkList,
  fillUncountedItems,
  getLatestPostedCountDate,
  queryError,
  resolveCountItems,
  setCountedQuantities,
  syncProductSalonMembership,
  voidCompletedCount,
} from "@/lib/data/counts";
import { updateProductNames } from "@/lib/data/products";
import { formatDate, singaporeToday } from "@/lib/format";
import type { ProductClassification } from "@/lib/labels";

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function assertCountDateAllowed(
  countDate: string,
  today: string,
  latestPostedDate: string | null,
  kind: "start" | "confirm",
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(countDate)) throw new Error("Enter a valid count date.");
  if (countDate < today) throw new Error("Count date cannot be in the past.");
  if (kind === "confirm" && countDate > today) {
    throw new Error(`This count is scheduled for ${formatDate(countDate)}. Confirm it on that day.`);
  }
  if (latestPostedDate && latestPostedDate >= today && countDate > latestPostedDate) {
    throw new Error(
      `The latest confirmed count is ${formatDate(latestPostedDate)}. You cannot choose a later date.`,
    );
  }
}

function salonFlagsFromForm(formData: FormData) {
  const productIds: string[] = [];
  const keepOnSalon = new Set<string>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("salon:")) continue;
    const productId = key.slice("salon:".length);
    if (!productId) continue;
    productIds.push(productId);
    if (String(value) === "1") keepOnSalon.add(productId);
  }
  return { productIds: [...new Set(productIds)], keepOnSalon };
}

function namesFromForm(formData: FormData) {
  const updates: { id: string; name: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("name:")) continue;
    const id = key.slice("name:".length);
    if (!id) continue;
    const name = String(value).trim();
    updates.push({ id, name: name ? name : null });
  }
  return updates;
}

export async function createInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const storeLocationId = emptyToNull(formData.get("store_location_id"));
  const filterBrandId = emptyToNull(formData.get("filter_brand_id"));
  const filterClassification = emptyToNull(formData.get("filter_classification")) as
    | ProductClassification
    | null;
  const filterTagId = emptyToNull(formData.get("filter_tag_id"));
  const today = singaporeToday();
  const countDate = String(formData.get("count_date") ?? "").trim() || today;
  const latestPostedDate = await getLatestPostedCountDate(supabase, companyId, branch.id);
  assertCountDateAllowed(countDate, today, latestPostedDate, "start");

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

export async function addCountEntryAction(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const storeLocationId = String(formData.get("store_location_id") ?? "");
  const quantityDelta = Number(formData.get("quantity_delta") ?? "");

  if (!productId) throw new Error("Search a product, then choose the line to count.");
  if (!storeLocationId) throw new Error("Select the location you are counting.");
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Enter an amount to add or deduct.");
  }

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status, store_location_id")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");
  if (count.store_location_id && count.store_location_id !== storeLocationId) {
    throw new Error("This count is limited to one storage location.");
  }

  const { data: location, error: locationError } = await supabase
    .from("store_locations")
    .select("id")
    .eq("id", storeLocationId)
    .eq("branch_id", branch.id)
    .maybeSingle();
  if (locationError) throw queryError(locationError, "Could not check the storage location.");
  if (!location) throw new Error("That storage location is not on this salon.");

  await addCountEntry(supabase, {
    countId: count.id,
    productId,
    storeLocationId,
    quantityDelta,
    createdBy: user.email ?? null,
  });

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
}

export async function saveCountQuantities(formData: FormData) {
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

  const updates: { id: string; counted: number }[] = [];
  for (const item of items) {
    const raw = formData.get(`counted:${item.id}`);
    if (raw === null || String(raw) === "") continue;
    const counted = Number(raw);
    if (!Number.isFinite(counted)) throw new Error("Counted quantities must be numbers.");
    updates.push({ id: item.id, counted });
  }

  await setCountedQuantities(supabase, count.id, updates, user.email ?? null);

  const salonFlags = salonFlagsFromForm(formData);
  if (salonFlags.productIds.length > 0) {
    await syncProductSalonMembership(supabase, branch.id, salonFlags.productIds, salonFlags.keepOnSalon);
  }

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
  revalidatePath("/products");
}

export async function fillUncountedCountItems(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (mode !== "zero" && mode !== "keep") {
    throw new Error("Choose whether to count remaining lines as 0 or keep the expected quantity.");
  }

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");

  await fillUncountedItems(supabase, count.id, mode);

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
}

export async function completeInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status, count_date")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");

  const today = singaporeToday();
  const latestPostedDate = await getLatestPostedCountDate(supabase, companyId, branch.id);
  assertCountDateAllowed(count.count_date, today, latestPostedDate, "confirm");

  const { data: sameDay, error: sameDayError } = await supabase
    .from("inventory_counts")
    .select("id")
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .eq("count_date", count.count_date)
    .eq("status", "completed")
    .neq("id", count.id);
  if (sameDayError) throw queryError(sameDayError, "Could not check counts already posted that day.");

  for (const previous of sameDay ?? []) {
    await voidCompletedCount(supabase, {
      companyId,
      countId: previous.id,
      createdBy: user.email ?? null,
    });
  }

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
        created_by: user.email ?? null,
        notes: "Count variance",
      })),
    );
    if (error) throw queryError(error, "Could not post count variances.");
  }

  const salonFlags = salonFlagsFromForm(formData);
  const tagged = new Set<string>();
  const productIds = [...new Set(items.map((item) => item.product_id))];
  for (const ids of chunkList(productIds.length > 0 ? productIds : ["00000000-0000-0000-0000-000000000000"])) {
    const { data, error } = await supabase
      .from("product_branches")
      .select("product_id")
      .eq("branch_id", branch.id)
      .in("product_id", ids);
    if (error) throw queryError(error, "Could not check salon product lists.");
    for (const row of data ?? []) tagged.add(row.product_id);
  }

  await assignProductsToSalon(
    supabase,
    branch.id,
    productIds.filter((productId) => {
      if (salonFlags.productIds.length > 0 && !salonFlags.keepOnSalon.has(productId)) return false;
      if (tagged.has(productId)) return false;
      return items.some((item) => item.product_id === productId && Number(item.counted_quantity ?? 0) > 0);
    }),
  );

  if (salonFlags.productIds.length > 0) {
    await syncProductSalonMembership(supabase, branch.id, salonFlags.productIds, salonFlags.keepOnSalon);
  }

  const allowedNameIds = new Set(productIds);
  const nameUpdates = namesFromForm(formData).filter((row) => allowedNameIds.has(row.id));
  if (nameUpdates.length > 0) {
    await updateProductNames(supabase, companyId, nameUpdates);
  }

  const { error: statusError } = await supabase
    .from("inventory_counts")
    .update({ status: "completed" })
    .eq("id", count.id);
  if (statusError) throw queryError(statusError, "Could not complete the count.");

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
  revalidatePath("/counts");
  revalidatePath("/reports");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  redirect(`/counts/${count.id}`);
}

export async function deleteInventoryCount(formData: FormData) {
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
  if (count.status !== "in_progress") {
    throw new Error("Only drafts can be deleted. Confirmed counts can be voided.");
  }

  const { error: deleteError } = await supabase.from("inventory_counts").delete().eq("id", count.id);
  if (deleteError) throw queryError(deleteError, "Could not delete the count.");

  revalidatePath("/counts");
  redirect("/counts");
}

export async function voidInventoryCount(formData: FormData) {
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
  if (count.status === "voided") throw new Error("This count is already voided.");
  if (count.status !== "completed") {
    throw new Error("Only confirmed counts can be voided. Drafts can be deleted.");
  }

  await voidCompletedCount(supabase, {
    companyId,
    countId: count.id,
    createdBy: user.email ?? null,
  });

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
  revalidatePath("/counts");
  revalidatePath("/reports");
  revalidatePath("/products");
}
