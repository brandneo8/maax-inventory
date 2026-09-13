"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteStockOutReport } from "./actions";
import { btnDangerClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function DeleteStockOutButton({
  reportId,
  compact = false,
}: {
  reportId: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    const ok = window.confirm("Delete this stock-out? It will be removed and its stock deduction reversed.");
    if (!ok) return;
    setPending(true);
    try {
      await deleteStockOutReport(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not delete this stock-out.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="report_id" value={reportId} />
      <button className={cn(btnDangerClass, compact && "px-2 py-1 text-xs")} disabled={pending} type="submit">
        {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
