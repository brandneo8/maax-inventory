import type { ProductClassification } from "@/lib/labels";
import { parseSize } from "@/lib/product-size";

const CLASSIFICATION_ALIASES: Record<string, ProductClassification> = {
  retail: "retail",
  inhouse: "inhouse",
  in_house: "inhouse",
  gwp: "gwp",
  retail_inhouse: "retail_inhouse",
  retail_in_house: "retail_inhouse",
};

export function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function parseClassification(value: string | null | undefined): ProductClassification | null {
  const key = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[+&]/g, "_")
    .replace(/[\s-]+/g, "_");
  return CLASSIFICATION_ALIASES[key] ?? null;
}

export function parseMoney(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

export function catalogSize(value: string | null | undefined) {
  const raw = normalizeOptionalText(value);
  if (!raw) return { sizeLabel: null, sizeMl: null };
  const parsed = parseSize(raw);
  return {
    sizeLabel: parsed?.label ?? raw,
    sizeMl: parsed?.ml ?? null,
  };
}

export function catalogRowName(row: Record<string, string>) {
  return normalizeOptionalText(row["order name"] || row["name"] || row["product"] || row["product name"]);
}

export function catalogRowSku(row: Record<string, string>) {
  return normalizeOptionalText(row["sku"]);
}

export function catalogRowBarcode(row: Record<string, string>) {
  return normalizeOptionalText(row["barcode"]);
}
