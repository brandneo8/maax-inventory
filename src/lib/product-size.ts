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
