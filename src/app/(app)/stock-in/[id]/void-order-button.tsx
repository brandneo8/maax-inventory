"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { voidPurchaseOrder } from "../actions";
import { btnDangerClass } from "@/lib/ui";

export function VoidOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const voidingRef = useRef(false);

  async function voidOrder() {
    if (voidingRef.current) return;
    const ok = window.confirm(
      "Void this order? It cannot be un-voided. Any stock already received on it will be removed and its cost impact reversed, as long as none of it has been used/sold and nothing newer has been received for the same products — otherwise voiding will be blocked and tell you why. Duplicate this order into a new draft if you need to redo it.",
    );
    if (!ok) return;
    voidingRef.current = true;
    setPending(true);
    try {
      const result = await voidPurchaseOrder(purchaseOrderId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } catch {
      window.alert("Could not reach the server. Check your connection, then reload to see whether the order was voided.");
    } finally {
      voidingRef.current = false;
      setPending(false);
    }
  }

  return (
    <button className={btnDangerClass} disabled={pending} type="button" onClick={() => void voidOrder()}>
      {pending ? "Voiding…" : "Void order"}
    </button>
  );
}
