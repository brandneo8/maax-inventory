export type ParsedSize = {
  label: string;
  ml: number;
};

const UNIT_FACTOR: Record<string, number> = {
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
};

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function displayUnit(unit: string) {
  if (unit === "l" || unit.startsWith("lit")) return "L";
  if (unit === "kg" || unit.startsWith("kilogram")) return "kg";
  if (unit === "g" || unit.startsWith("gram")) return "g";
  return "ml";
}

export function parseSize(raw: string | null | undefined): ParsedSize | null {
  if (!raw) return null;
  const compact = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!compact) return null;

  const match = compact.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] ?? "ml";
  const factor = UNIT_FACTOR[unit];
  if (factor == null) return null;

  return {
    label: `${formatNumber(value)} ${displayUnit(unit)}`,
    ml: value * factor,
  };
}

export function sizesMatch(leftMl: number | null | undefined, rightMl: number | null | undefined) {
  if (leftMl == null || rightMl == null) return false;
  return Math.abs(leftMl - rightMl) < 0.0001;
}

/** Millilitres in one US fluid ounce. */
const ML_PER_OZ = 29.5735;

const SIZE_IN_TEXT =
  /(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|oz|ml|millilit(?:re|er)s?|ltr|lit(?:re|er)s?|l|kg|kilograms?|g|gm|grams?)(?![a-z])/gi;

/**
 * Finds a size anywhere in a piece of text — "Detox Shampoo - 8.5oz",
 * "300ml / 10 fl oz", "1L" — in ml (grams count as ml). When the text gives
 * both, the metric size wins over ounces.
 */
export function findSize(text: string | null | undefined): ParsedSize | null {
  if (!text) return null;
  let ounces: ParsedSize | null = null;
  for (const match of text.matchAll(SIZE_IN_TEXT)) {
    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = match[2].toLowerCase().replace(/[\s.]+/g, "");
    if (unit.endsWith("oz")) {
      ounces ??= { label: `${formatNumber(value)} oz`, ml: value * ML_PER_OZ };
      continue;
    }
    const normalised = unit === "ltr" ? "l" : unit === "gm" ? "g" : unit;
    const factor = UNIT_FACTOR[normalised];
    if (factor != null) return { label: `${formatNumber(value)} ${displayUnit(normalised)}`, ml: value * factor };
  }
  return ounces;
}

/** Sizes the same within 3% (so 8.5 oz = 250 ml, 31.5 oz = 930 ml). */
export function sizesClose(leftMl: number, rightMl: number) {
  return Math.abs(leftMl - rightMl) <= Math.max(leftMl, rightMl) * 0.03;
}
