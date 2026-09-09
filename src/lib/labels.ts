import type { Database } from "@/lib/supabase/types";

export type ProductClassification = Database["public"]["Enums"]["product_classification"];
export type PoStatus = Database["public"]["Enums"]["po_status"];
export type OrderChannel = Database["public"]["Enums"]["order_channel"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

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

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "disputed", label: "Disputed" },
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

export function invoiceStatusLabel(value: InvoiceStatus) {
  return INVOICE_STATUSES.find((item) => item.value === value)?.label ?? value;
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

export function countStatusLabel(status: string) {
  if (status === "in_progress") return "Draft";
  if (status === "completed") return "Confirmed";
  if (status === "voided") return "Voided";
  return status.replaceAll("_", " ");
}
