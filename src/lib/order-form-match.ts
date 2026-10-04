import type { OrderFormLine } from "@/lib/order-form-reader";

/**
 * Lining up a supplier's order form against the brand's products on Pulse:
 * shared by the price list comparison and the suppliers table's match counts.
 */

/** A Pulse product as the comparison sees it. */
export type ComparisonProduct = {
  id: string;
  sku: string;
  orderName: string;
  name: string;
  size: string;
  unitCost: number;
  rrp: number | null;
};

/** How a row's two sides were paired. */
export type Match = "manual" | "sku" | "name" | "similar" | "none";
export type Row = {
  pulse: ComparisonProduct | null;
  form: OrderFormLine | null;
  /** The form line's key (for saving a match by hand); null on Pulse-only rows. */
  lineKey: string | null;
  match: Match;
  /** Paired by SKU, but the names have little in common. */
  namesDiffer: boolean;
};

/** SKUs compared ignoring case, spaces and leading zeros ("01402" = "1402"). */
function skuKey(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  return /^\d+$/.test(compact) ? String(Number(compact)) : compact;
}

/** Names compared on letters and digits only ("Treatment Original 200ml" = "treatment original 200 ML"). */
function nameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function words(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

/** Share of words two names have in common (0 to 1). */
function similarity(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Share of the shorter name's words found in the other (0 to 1), or 0 when
 * fewer than three words are shared — forms often add words ("Backbar",
 * "Launch May 2026") that shouldn't stop a match.
 */
function containment(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared < 3 ? 0 : shared / Math.min(a.size, b.size);
}

function productLabel(product: ComparisonProduct) {
  return [product.orderName || product.name, product.size].filter(Boolean).join(" ");
}

function productSimilarity(
  product: ComparisonProduct,
  line: OrderFormLine,
  measure: (left: string, right: string) => number = similarity,
) {
  const formName = `${line.description} ${line.size}`;
  return Math.max(measure(productLabel(product), formName), measure(`${product.name} ${product.size}`, formName));
}

/** Below this (share of words in common), names are too different to pair without a matching SKU. */
const SIMILAR_NAMES = 0.7;
/** Below this, a SKU pairing is flagged for checking. */
const DIFFERENT_NAMES = 0.25;

/** Hand-set key prefix for a product kept off the order form: `!<productId>`. */
export const KEPT_OFF = "!";

/** Identifies a form line across re-uploads of the same form: its SKU and description. */
export function lineKeys(lines: OrderFormLine[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${skuKey(line.sku)}|${nameKey(line.description)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** Pairs (line, product) greedily, best score first, each side used once. */
function pairBest(
  rows: Row[],
  products: ComparisonProduct[],
  unmatched: Set<string>,
  score: (row: Row, product: ComparisonProduct) => number | null,
  match: Match,
) {
  const pairs: { row: Row; product: ComparisonProduct; score: number }[] = [];
  for (const row of rows) {
    if (row.match !== "none" || !row.form) continue;
    for (const product of products) {
      if (!unmatched.has(product.id)) continue;
      const value = score(row, product);
      if (value != null) pairs.push({ row, product, score: value });
    }
  }
  pairs.sort((left, right) => right.score - left.score);
  for (const pair of pairs) {
    if (pair.row.match !== "none" || !unmatched.has(pair.product.id)) continue;
    unmatched.delete(pair.product.id);
    pair.row.pulse = pair.product;
    pair.row.match = match;
    if (match === "sku") pair.row.namesDiffer = pair.score < DIFFERENT_NAMES;
  }
}

/**
 * Lines up the order form against this brand's products on Pulse: matches set
 * by hand first (including products kept off the form), then the same SKU (the closest name wins when the form
 * repeats a SKU), then the same name, then a similar name. Products the form
 * doesn't list go at the end.
 */
export function lineUp(products: ComparisonProduct[], lines: OrderFormLine[], manual: Map<string, string | null>): Row[] {
  const unmatched = new Set(products.map((product) => product.id));
  const byId = new Map(products.map((product) => [product.id, product]));
  const keys = lineKeys(lines);
  const keptOff = new Set<string>();
  for (const [key, productId] of manual) {
    if (key.startsWith(KEPT_OFF) && productId && byId.has(productId)) {
      keptOff.add(productId);
      unmatched.delete(productId);
    }
  }

  const rows: Row[] = lines.map((line, index) => {
    const lineKey = keys[index];
    if (manual.has(lineKey)) {
      const productId = manual.get(lineKey);
      const product = productId ? byId.get(productId) : undefined;
      if (productId == null) return { pulse: null, form: line, lineKey, match: "manual", namesDiffer: false };
      if (product && unmatched.has(product.id)) {
        unmatched.delete(product.id);
        return { pulse: product, form: line, lineKey, match: "manual", namesDiffer: false };
      }
    }
    return { pulse: null, form: line, lineKey, match: "none", namesDiffer: false };
  });

  pairBest(
    rows,
    products,
    unmatched,
    (row, product) =>
      row.form!.sku && product.sku && skuKey(row.form!.sku) === skuKey(product.sku)
        ? productSimilarity(product, row.form!)
        : null,
    "sku",
  );
  pairBest(
    rows,
    products,
    unmatched,
    (row, product) => {
      const formKeys = new Set([nameKey(row.form!.description), nameKey(`${row.form!.description} ${row.form!.size}`)]);
      const same = [product.orderName, product.name, `${product.orderName} ${product.size}`, `${product.name} ${product.size}`]
        .filter((value) => value.trim())
        .some((value) => formKeys.has(nameKey(value)));
      return same ? 1 : null;
    },
    "name",
  );
  pairBest(
    rows,
    products,
    unmatched,
    (row, product) => {
      const value = productSimilarity(product, row.form!, containment);
      return value >= SIMILAR_NAMES ? value + productSimilarity(product, row.form!) / 10 : null;
    },
    "similar",
  );

  for (const product of products) {
    if (unmatched.has(product.id) || keptOff.has(product.id)) {
      const match = keptOff.has(product.id) ? "manual" : "none";
      rows.push({ pulse: product, form: null, lineKey: null, match, namesDiffer: false });
    }
  }
  return rows;
}
