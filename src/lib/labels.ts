import type { Database } from "@/lib/supabase/types";

export type ProductClassification = Database["public"]["Enums"]["product_classification"];
export type PoStatus = Database["public"]["Enums"]["po_status"];
export type OrderChannel = Database["public"]["Enums"]["order_channel"];
export type InventoryTxnType = Database["public"]["Enums"]["inventory_txn_type"];

export const CLASSIFICATIONS: { value: ProductClassification; label: string }[] = [
  { value: "retail", label: "Retail" },
  { value: "inhouse", label: "In-house" },
  { value: "gwp", label: "GWP" },
  { value: "retail_inhouse", label: "Retail + in-house" },
];

export const PO_STATUSES: { value: PoStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Voided" },
];

export const ORDER_SENDER_NAMES = ["Brandon Neo", "Ethan Neo", "Oey Shui Ling", "Jimmy Lim", "Kin Leong"];

export const ORDER_CHANNELS: { value: OrderChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "portal", label: "Portal" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Other" },
];

export function classificationLabel(value: ProductClassification | null | undefined) {
  return CLASSIFICATIONS.find((item) => item.value === value)?.label ?? "—";
}

export function classificationTagsLabel(values: ProductClassification[] | null | undefined) {
  return (values ?? [])
    .map((value) => classificationLabel(value))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .join(", ");
}

const RETAIL_FACING_CLASSIFICATIONS: ProductClassification[] = ["retail", "gwp", "retail_inhouse"];

// Whether a classification set makes a product retail-facing at a branch —
// used to bucket the stock-out picker into retail vs in-house. This is a
// classification check only; whether a product may appear in the POS
// system itself is now a separate, manual decision (products.pos_allowed,
// set on /pos), not derived from classification.
export function isRetailFacing(values: ProductClassification[] | null | undefined) {
  return (values ?? []).some((value) => RETAIL_FACING_CLASSIFICATIONS.includes(value));
}

const POS_EXCLUDED_TAG_NAMES = ["colour"];

/**
 * Starting pos_allowed value for a brand-new product, decided purely by
 * tag name at creation time — explicit and easy to extend later. Only
 * ever used as the initial value; after creation, pos_allowed is manual
 * and only ever changes through /pos, regardless of later tag edits.
 */
export function defaultPosAllowed(tagNames: string[]) {
  return !tagNames.some((name) => POS_EXCLUDED_TAG_NAMES.includes(name.trim().toLowerCase()));
}

export function poStatusLabel(value: PoStatus) {
  return PO_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function salonName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (normalized === "min" || normalized === "min salon") return "Min Salon";
  if (normalized === "kin" || normalized === "kin salon") return "Kin Salon";
  return name;
}

export function salonChipLabel(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+salon$/, "");
  return normalized || name.trim().toLowerCase();
}

export function keepOnSalonLabel(name: string) {
  const chip = salonChipLabel(name);
  if (!chip) return "Keep on salon";
  return `Keep on ${chip.charAt(0).toUpperCase()}${chip.slice(1)}`;
}

export function countStatusLabel(status: string) {
  if (status === "in_progress") return "Draft";
  if (status === "completed") return "Confirmed";
  if (status === "voided") return "Voided";
  return status.replaceAll("_", " ");
}

export function countTypeLabel(countType: string) {
  if (countType === "opening_balance") return "Opening balance";
  if (countType === "regular") return "Regular";
  return countType.replaceAll("_", " ");
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  goods_receipt: "Goods receipt",
  retail_use: "Retail use",
  inhouse_use: "In-house use",
  count_adjustment: "Count adjustment",
  transfer: "Transfer",
  waste: "Waste",
  gwp_use: "GWP use",
  initial_stock: "Initial stock",
};

export function movementTypeLabel(txnType: string) {
  return MOVEMENT_TYPE_LABELS[txnType] ?? txnType.replaceAll("_", " ");
}
