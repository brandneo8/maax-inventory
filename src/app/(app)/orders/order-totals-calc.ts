import { roundMoney } from "@/lib/catalog-pricing";

export function computeOrderTotals(
  lines: { quantity_ordered: number; unit_price: number }[],
  gstRegistered: boolean,
  gstRate: number,
) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const quantity = Number(line.quantity_ordered) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const lineSubtotal = quantity * unitPrice;
    const lineTax = gstRegistered ? roundMoney(lineSubtotal * (gstRate / 100)) : 0;
    subtotal += lineSubtotal;
    taxTotal += lineTax;
  }
  subtotal = roundMoney(subtotal);
  taxTotal = roundMoney(taxTotal);
  return { subtotal, taxTotal, grandTotal: roundMoney(subtotal + taxTotal) };
}
