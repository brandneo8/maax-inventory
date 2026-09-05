const sgd = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
});

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? sgd.format(amount) : "—";
}

export function formatQty(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "—";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
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
