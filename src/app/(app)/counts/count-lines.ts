import type { getInventoryCount } from "@/lib/data/counts";

export type CountLine = {
  id: string;
  productId: string;
  storeLocationId: string;
  orderName: string;
  name: string;
  sku: string;
  brand: string;
  location: string;
  expected: number;
  counted: number | null;
  variance: number | null;
};

export type CountEntryLine = {
  id: string;
  itemId: string;
  orderName: string;
  name: string;
  brand: string;
  location: string;
  quantityDelta: number;
  createdAt: string;
};

export type CountLocationOption = {
  id: string;
  name: string;
};

function brandName(value: unknown) {
  const brand = Array.isArray(value) ? value[0] : value;
  if (!brand || typeof brand !== "object" || !("name" in brand)) return "";
  return String((brand as { name?: string | null }).name ?? "").trim();
}

export function toCountLine(
  item: Awaited<ReturnType<typeof getInventoryCount>>["items"][number],
): CountLine {
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const itemLocation = Array.isArray(item.store_locations) ? item.store_locations[0] : item.store_locations;
  return {
    id: item.id,
    productId: item.product_id,
    storeLocationId: item.store_location_id,
    orderName: product?.order_name?.trim() ?? "",
    name: product?.name?.trim() ?? "",
    sku: product?.sku?.trim() ?? "",
    brand: brandName(product && "brands" in product ? product.brands : null),
    location: itemLocation?.name ?? "—",
    expected: Number(item.expected_quantity ?? 0),
    counted: item.counted_quantity === null ? null : Number(item.counted_quantity),
    variance: item.variance === null ? null : Number(item.variance),
  };
}

export function toCountEntry(
  entry: Awaited<ReturnType<typeof getInventoryCount>>["entries"][number],
  item: CountLine | undefined,
): CountEntryLine {
  return {
    id: entry.id,
    itemId: entry.inventory_count_item_id,
    orderName: item?.orderName ?? "",
    name: item?.name ?? "",
    brand: item?.brand ?? "",
    location: item?.location ?? "—",
    quantityDelta: Number(entry.quantity_delta),
    createdAt: entry.created_at,
  };
}

export function sortCountLines(rows: CountLine[]) {
  return [...rows].sort((a, b) => {
    const brand = a.brand.localeCompare(b.brand, undefined, { sensitivity: "base" });
    if (brand !== 0) return brand;
    const orderName = a.orderName.localeCompare(b.orderName, undefined, { sensitivity: "base" });
    if (orderName !== 0) return orderName;
    const name = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (name !== 0) return name;
    return a.location.localeCompare(b.location, undefined, { sensitivity: "base" });
  });
}

export function signedQty(value: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const formatted = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return amount > 0 ? `+${formatted}` : formatted;
}

export function varianceTextClass(value: number | null) {
  if (value == null || value === 0) return "text-black";
  return value > 0 ? "text-emerald-600" : "text-red-600";
}
