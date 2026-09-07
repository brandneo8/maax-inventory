const sgd = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
});

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? sgd.format(amount) : "—";
}

export function formatPercent(value: number | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(1)}%` : "—";
}

export function formatQty(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function formatSku(sku: string | null | undefined) {
  return sku?.trim() || "—";
}

export function productDisplayName(
  product:
    | {
        name?: string | null;
        orderName?: string | null;
        order_name?: string | null;
      }
    | null
    | undefined,
) {
  if (!product) return "";
  return product.name?.trim() || product.orderName?.trim() || product.order_name?.trim() || "";
}

export function productLabel(
  product: {
    sku?: string | null;
    name?: string | null;
    orderName?: string | null;
    order_name?: string | null;
  } | null | undefined,
  fallback = "—",
) {
  if (!product) return fallback;
  const name = productDisplayName(product);
  const sku = product.sku?.trim() || "";
  if (sku && name) return `${sku} — ${name}`;
  return sku || name || fallback;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
