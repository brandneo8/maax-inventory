import type { Database } from "@/lib/supabase/types";

export type ProductClassification = Database["public"]["Enums"]["product_classification"];
export type PoStatus = Database["public"]["Enums"]["po_status"];
export type OrderChannel = Database["public"]["Enums"]["order_channel"];

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
  { value: "cancelled", label: "Cancelled" },
];

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

export function poStatusLabel(value: PoStatus) {
  return PO_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function salonName(name: string) {
  if (name === "Min") return "Min Salon";
  if (name === "Kin") return "Kin Salon";
  return name;
}
