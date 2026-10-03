"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteDraftPurchaseOrder } from "../actions";
import { btnDangerClass } from "@/lib/ui";

export function DeleteDraftOrderButton({ purchaseOrderId, poNumber }: { purchaseOrderId: string; poNumber: string }) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    const ok = window.confirm(`Delete draft ${poNumber}? This removes it completely and can't be undone.`);
    if (!ok) return;
    setPending(true);
    try {
      await deleteDraftPurchaseOrder(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not delete this draft.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="id" value={purchaseOrderId} />
      <button className={btnDangerClass} disabled={pending} type="submit">
        {pending ? "Deleting…" : "Delete draft"}
      </button>
    </form>
  );
}
