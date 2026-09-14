"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { duplicatePurchaseOrder } from "../actions";
import { btnSecondaryClass } from "@/lib/ui";

export function DuplicateOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    try {
      await duplicatePurchaseOrder(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not duplicate this order.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="id" value={purchaseOrderId} />
      <button className={btnSecondaryClass} disabled={pending} type="submit">
        {pending ? "Duplicating…" : "Duplicate order"}
      </button>
    </form>
  );
}
