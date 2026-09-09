export const fieldClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400";

export const btnClass =
  "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50";

export const btnSecondaryClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50";

export const btnDangerClass =
  "inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50";

export const tableClass = "min-w-full text-left text-sm";
export const thClass = "border-b border-border px-3 py-2 font-medium text-muted";
export const tdClass = "border-b border-border px-3 py-2";

export function workingIn(displayName: string) {
  return `Working in ${displayName}.`;
}
