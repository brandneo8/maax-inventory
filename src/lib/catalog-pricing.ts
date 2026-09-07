export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function catalogTax(unitCost: number, gstRegistered: boolean, ratePercentage = 9) {
  const cost = Number.isFinite(unitCost) ? unitCost : 0;
  const taxAmount = gstRegistered ? roundMoney(cost * (ratePercentage / 100)) : 0;
  return {
    taxAmount,
    unitCostWithTax: roundMoney(cost + taxAmount),
  };
}

export function confirmedRetailPrice(unitCost: number, rrp: number | null | undefined) {
  const cost = Number.isFinite(unitCost) ? unitCost : 0;
  const recommended = Number(rrp);
  if (Number.isFinite(recommended) && recommended > 0) return roundMoney(recommended);
  return roundMoney(cost * 2);
}

export function grossMarginPercent(crp: number, cost: number) {
  if (!Number.isFinite(crp) || crp <= 0) return null;
  return roundMoney(((crp - cost) / crp) * 100);
}

export function inheritedUnitCost(allocatedCost: number, quantity: number) {
  if (!Number.isFinite(allocatedCost) || !Number.isFinite(quantity) || quantity <= 0) return 0;
  return roundMoney(allocatedCost / quantity);
}

export function allocatedBundleTotal(values: Array<number | null | undefined>) {
  return roundMoney(
    values.reduce<number>((sum, value) => {
      if (value == null || !Number.isFinite(value)) return sum;
      return sum + value;
    }, 0),
  );
}

export function bundleCostRemainder(parentUnitCost: number, allocated: Array<number | null | undefined>) {
  const parent = Number.isFinite(parentUnitCost) ? parentUnitCost : 0;
  return roundMoney(parent - allocatedBundleTotal(allocated));
}

export function bundleCostsComplete(parentUnitCost: number, allocated: Array<number | null | undefined>) {
  if (allocated.length === 0) return true;
  if (allocated.some((value) => value == null || !Number.isFinite(value) || Number(value) < 0)) return false;
  return Math.abs(bundleCostRemainder(parentUnitCost, allocated)) < 0.005;
}

export function autoAllocateBundleCosts<T extends { allocatedCost: string }>(parentUnitCost: number, contents: T[]): T[] {
  if (contents.length !== 1) return contents;
  const parent = Number.isFinite(parentUnitCost) ? parentUnitCost : 0;
  return [{ ...contents[0], allocatedCost: String(roundMoney(parent)) }];
}
