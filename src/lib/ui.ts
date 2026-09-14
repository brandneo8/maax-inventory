import type { WheelEvent } from "react";

export const fieldClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400";

// For type="number" quantity/price fields: hides the native up/down spinner
// (they invite mis-clicks and don't add value on money/qty inputs).
export const numberFieldClass =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Attach to onWheel on a type="number" input: without this, scrolling the
// page while the cursor happens to be over a focused number field silently
// changes its value instead of scrolling.
export function blurOnWheel(event: WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}

export const btnClass =
  "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50";

export const btnSecondaryClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50";

export const btnDangerClass =
  "inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

export const tableClass = "min-w-full text-left text-sm";
export const thClass = "border-b border-border px-3 py-2 font-medium text-muted";
export const tdClass = "border-b border-border px-3 py-2";
export const checkboxClass = "h-[1.2em] w-[1.2em] shrink-0 accent-slate-900";

export function workingIn(displayName: string) {
  return `Working in ${displayName}.`;
}
