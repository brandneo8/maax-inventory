/** A unit price after a percent discount, to the cent. */
export function discountedPrice(unitPrice: number, discountPercent: number) {
  const percent = Math.min(100, Math.max(0, discountPercent || 0));
  return Math.round(unitPrice * (1 - percent / 100) * 100) / 100;
}
