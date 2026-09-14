"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { voidPurchaseOrder } from "../actions";
import { btnDangerClass } from "@/lib/ui";

export function VoidOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    const ok = window.confirm(
      "Void this order? It cannot be un-voided. Any stock already received on it will be removed and its cost impact reversed, as long as none of it has been used/sold and nothing newer has been received for the same products — otherwise voiding will be blocked and tell you why. Duplicate this order into a new draft if you need to redo it.",
    );
    if (!ok) return;
    setPending(true);
    try {
      await voidPurchaseOrder(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not void this order.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="id" value={purchaseOrderId} />
      <button className={btnDangerClass} disabled={pending} type="submit">
        {pending ? "Voiding…" : "Void order"}
      </button>
    </form>
  );
}
