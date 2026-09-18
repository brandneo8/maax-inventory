"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import {
  addCountEntry,
  assignProductsToSalon,
  chunkList,
  fillUncountedItems,
  getCurrentCosts,
  getLatestPostedCountDate,
  getScannedProductIds,
  queryError,
  resolveCountItems,
  searchCatalogForCount,
  setCountedQuantities,
  syncProductSalonMembership,
  voidCompletedCount,
  type CountType,
} from "@/lib/data/counts";
import { getDefaultStoreLocationId } from "@/lib/data/lookups";
import { updateProductNames } from "@/lib/data/products";
import { businessTxnDate, formatDate, singaporeToday } from "@/lib/format";
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
  if (kind === "confirm" && latestPostedDate && countDate < latestPostedDate) {
    throw new Error(
      `A count dated ${formatDate(latestPostedDate)} is already confirmed for this salon — confirming this ${formatDate(countDate)} count would post stale variances on top of it. Void the ${formatDate(latestPostedDate)} count first if you need to redo that day.`,
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

async function salonFlagsKeepingScanned(
  supabase: Parameters<typeof getScannedProductIds>[0],
  countId: string,
  formData: FormData,
) {
  const flags = salonFlagsFromForm(formData);
  const scanned = await getScannedProductIds(supabase, countId);
  const productIds = [...new Set([...flags.productIds, ...scanned])];
  const keepOnSalon = new Set(flags.keepOnSalon);
  for (const productId of scanned) keepOnSalon.add(productId);
  return { productIds, keepOnSalon };
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
  const countType = String(formData.get("count_type") ?? "regular") as CountType;
  if (countType !== "regular" && countType !== "opening_balance") {
    throw new Error("Unknown count type.");
  }
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
    filter_brand_id: filterBrandId,
    filter_classification: filterClassification,
    filter_tag_id: filterTagId,
  });

  const { data: count, error } = await supabase
    .from("inventory_counts")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      store_location_id: null,
      filter_brand_id: filterBrandId,
      filter_classification: filterClassification,
      filter_tag_id: filterTagId,
      status: "in_progress",
      count_date: countDate,
      count_type: countType,
      counted_by: user.email,
    })
    .select("id")
    .single();

  if (error || !count) throw queryError(error, "Could not start the count.");

  for (const batch of chunkList(
    items.map((item) => ({
      inventory_count_id: count.id,
      product_id: item.product_id,
      store_location_id: null,
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

export async function duplicateInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const sourceId = String(formData.get("count_id") ?? "");

  const { data: source, error: sourceError } = await supabase
    .from("inventory_counts")
    .select("filter_brand_id, filter_classification, filter_tag_id, count_type")
    .eq("id", sourceId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();
  if (sourceError || !source) throw queryError(sourceError, "Count not found.");

  const today = singaporeToday();
  const latestPostedDate = await getLatestPostedCountDate(supabase, companyId, branch.id);
  assertCountDateAllowed(today, today, latestPostedDate, "start");

  // Copy each SKU's last counted amount as a starting point — not the
  // individual scan-by-scan transactions, just the final summary per
  // product — so a re-count only needs touching what actually changed.
  // Expected quantity is still freshly resolved against today's live stock.
  const sourceCountedByProduct = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error: sourceItemsError } = await supabase
      .from("inventory_count_items")
      .select("product_id, counted_quantity")
      .eq("inventory_count_id", sourceId)
      .order("id")
      .range(from, from + 999);
    if (sourceItemsError) throw queryError(sourceItemsError, "Could not load the source count's lines.");
    for (const row of data ?? []) {
      if (row.counted_quantity != null) sourceCountedByProduct.set(row.product_id, Number(row.counted_quantity));
    }
    if (!data || data.length < 1000) break;
  }

  const items = await resolveCountItems(supabase, companyId, branch.id, {
    filter_brand_id: source.filter_brand_id,
    filter_classification: source.filter_classification,
    filter_tag_id: source.filter_tag_id,
  });

  const { data: count, error } = await supabase
    .from("inventory_counts")
    .insert({
      company_id: companyId,
      branch_id: branch.id,
      store_location_id: null,
      filter_brand_id: source.filter_brand_id,
      filter_classification: source.filter_classification,
      filter_tag_id: source.filter_tag_id,
      status: "in_progress",
      count_date: today,
      count_type: source.count_type,
      counted_by: user.email,
    })
    .select("id")
    .single();
  if (error || !count) throw queryError(error, "Could not duplicate the count.");

  for (const batch of chunkList(
    items.map((item) => ({
      inventory_count_id: count.id,
      product_id: item.product_id,
      store_location_id: null,
      expected_quantity: item.expected_quantity,
      counted_quantity: sourceCountedByProduct.get(item.product_id) ?? null,
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
  const quantityDelta = Number(formData.get("quantity_delta") ?? "");

  if (!productId) throw new Error("Search a product, then choose the line to count.");
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Enter an amount to add or deduct.");
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

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, is_active")
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (productError) throw queryError(productError, "Could not check that product.");
  if (!product || !product.is_active) throw new Error("That product is not in the catalog.");

  const applied = await addCountEntry(supabase, {
    countId: count.id,
    productId,
    quantityDelta,
    createdBy: user.email ?? null,
    branchId: branch.id,
  });
  await assignProductsToSalon(supabase, branch.id, [productId]);
  return applied;
}

export async function searchCountProductsAction(countId: string, query: string) {
  const { supabase, companyId, branch } = await requireBranch();
  const [countResult, hits] = await Promise.all([
    supabase
      .from("inventory_counts")
      .select("id, status")
      .eq("id", countId)
      .eq("company_id", companyId)
      .eq("branch_id", branch.id)
      .maybeSingle(),
    searchCatalogForCount(supabase, companyId, branch.id, query),
  ]);
  if (countResult.error) throw queryError(countResult.error, "Count not found.");
  if (!countResult.data) throw new Error("Count not found.");
  if (countResult.data.status !== "in_progress") throw new Error("This count is already closed.");
  return hits;
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

  const salonFlags = await salonFlagsKeepingScanned(supabase, count.id, formData);
  if (salonFlags.productIds.length > 0) {
    await syncProductSalonMembership(supabase, branch.id, salonFlags.productIds, salonFlags.keepOnSalon);
  }

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
}

export async function fillUncountedCountItems(formData: FormData) {
  const { supabase, companyId, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (mode !== "zero" && mode !== "keep") {
    throw new Error("Choose whether to count remaining products as 0 or keep the expected quantity.");
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

  const itemIds = formData.getAll("item_id").map((value) => String(value)).filter(Boolean);
  await fillUncountedItems(supabase, count.id, mode, itemIds);

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
}

export async function completeInventoryCount(formData: FormData) {
  const { supabase, companyId, user, branch } = await requireBranch();
  const countId = String(formData.get("count_id") ?? "");

  const { data: count, error: countError } = await supabase
    .from("inventory_counts")
    .select("id, status, count_date, count_type")
    .eq("id", countId)
    .eq("company_id", companyId)
    .eq("branch_id", branch.id)
    .single();

  if (countError || !count) throw queryError(countError, "Count not found.");
  if (count.status !== "in_progress") throw new Error("This count is already closed.");

  const countType = (count.count_type as CountType) ?? "regular";
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

  const defaultLocationId = await getDefaultStoreLocationId(supabase, branch.id);

  const items: {
    id: string;
    product_id: string;
    counted_quantity: number | null;
    expected_quantity: number | null;
    variance: number | null;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: itemsError } = await supabase
      .from("inventory_count_items")
      .select("id, product_id, counted_quantity, expected_quantity, variance")
      .eq("inventory_count_id", count.id)
      .order("id")
      .range(from, from + 999);
    if (itemsError) throw queryError(itemsError, "Could not load count lines.");
    items.push(...(data ?? []));
    if (!data || !data.length || data.length < 1000) break;
  }

  // A product with nothing expected and nothing counted has no real
  // ambiguity to resolve — it doesn't need to block completion the way a
  // genuine gap (something expected, still uncounted) does.
  if (items.some((item) => item.counted_quantity === null && Number(item.expected_quantity ?? 0) !== 0)) {
    throw new Error("Enter a counted quantity for every product before completing.");
  }

  const adjustments = items.filter((item) => Number(item.variance ?? 0) !== 0);
  const surplus = adjustments.filter((item) => Number(item.variance) > 0);
  const shortfall = adjustments.filter((item) => Number(item.variance) < 0);
  const txnDate = businessTxnDate(count.count_date);

  // A surplus needs a ground-truth cost decided and recorded: the branch's
  // current average for a regular count (blending at the existing average
  // leaves it unchanged unless there wasn't one — i.e. it stays at $0), or
  // whatever the admin entered for an opening-balance count. Everything
  // else — folding this into the running average, and re-costing
  // shortfalls at whatever the average is once this count's date is
  // correctly slotted into history — happens automatically via
  // fn_recompute_branch_cost the moment these rows are inserted.
  let surplusCosts = new Map<string, number>();
  if (countType === "opening_balance") {
    const missing: string[] = [];
    for (const item of surplus) {
      const raw = formData.get(`cost:${item.product_id}`);
      const cost = raw == null || String(raw).trim() === "" ? null : Number(raw);
      if (cost == null || !Number.isFinite(cost) || cost < 0) {
        missing.push(item.product_id);
        continue;
      }
      surplusCosts.set(item.product_id, cost);
    }
    if (missing.length > 0) {
      throw new Error("Enter a cost for every counted product before completing this opening-balance count.");
    }
  } else {
    surplusCosts = await getCurrentCosts(
      supabase,
      branch.id,
      surplus.map((item) => item.product_id),
    );
  }

  for (const batch of chunkList(surplus)) {
    const { error } = await supabase.from("inventory_transactions").insert(
      batch.map((item) => ({
        company_id: companyId,
        product_id: item.product_id,
        store_location_id: defaultLocationId,
        txn_type: "count_adjustment" as const,
        quantity_change: Number(item.variance),
        reference_table: "inventory_count_items",
        reference_id: item.id,
        created_by: user.email ?? null,
        notes: "Count variance",
        unit_cost: surplusCosts.get(item.product_id) ?? 0,
        txn_date: txnDate,
      })),
    );
    if (error) throw queryError(error, "Could not post count variances.");
  }

  for (const batch of chunkList(shortfall)) {
    const { error } = await supabase.from("inventory_transactions").insert(
      batch.map((item) => ({
        company_id: companyId,
        product_id: item.product_id,
        store_location_id: defaultLocationId,
        txn_type: "count_adjustment" as const,
        quantity_change: Number(item.variance),
        reference_table: "inventory_count_items",
        reference_id: item.id,
        created_by: user.email ?? null,
        notes: "Count variance",
        txn_date: txnDate,
      })),
    );
    if (error) throw queryError(error, "Could not post count variances.");
  }

  const salonFlags = await salonFlagsKeepingScanned(supabase, count.id, formData);
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

export async function voidInventoryCount(formData: FormData): Promise<{ ok: true }> {
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

  // Cost correctness on void is now handled automatically by
  // fn_recompute_branch_cost regardless of what order things happened in,
  // so there's no longer a case where voiding needs to be blocked.
  await voidCompletedCount(supabase, {
    companyId,
    countId: count.id,
    createdBy: user.email ?? null,
  });

  revalidatePath(`/counts/${count.id}`);
  revalidatePath(`/counts/${count.id}/review`);
  revalidatePath("/counts");
  revalidatePath("/reports");
  return { ok: true };
}
