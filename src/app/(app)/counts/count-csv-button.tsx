"use client";

import { downloadCsv } from "@/lib/csv";
import { btnSecondaryClass } from "@/lib/ui";
import type { CountLine } from "./count-lines";

export function CountCsvButton({
  lines,
  branchName,
  countDate,
}: {
  lines: CountLine[];
  branchName: string;
  countDate: string;
}) {
  function download() {
    if (lines.length === 0) return;
    downloadCsv(
      `maax-count-${branchName.toLowerCase().replace(/\s+/g, "-")}-${countDate}.csv`,
      lines.map((line) => ({
        SKU: line.sku,
        "Order name": line.orderName,
        Name: line.name,
        Brand: line.brand,
        "Brand sub": line.brandSub,
        Size: line.sizeLabel,
        Expected: line.expected,
        Counted: line.counted ?? "",
        Variance: line.variance ?? "",
      })),
    );
  }

  return (
    <button className={btnSecondaryClass} type="button" disabled={lines.length === 0} onClick={download}>
      Download CSV
    </button>
  );
}
