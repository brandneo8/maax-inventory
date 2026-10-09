"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { duplicatePurchaseOrder } from "../actions";
import { btnSecondaryClass } from "@/lib/ui";

export function DuplicateOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // One click does it once, however fast it's clicked again.
  const busyRef = useRef(false);

  async function run() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    let leaving = false;
    try {
      const result = await duplicatePurchaseOrder(purchaseOrderId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      leaving = true;
      router.push(`/stock-in/${result.orderId}`);
    } catch {
      window.alert("Could not reach the server. Check your connection, then reload to see whether it went through.");
    } finally {
      if (!leaving) {
        busyRef.current = false;
        setPending(false);
      }
    }
  }

  return (
    <button className={btnSecondaryClass} disabled={pending} type="button" onClick={() => void run()}>
      {pending ? "Duplicating…" : "Duplicate order"}
    </button>
  );
}
