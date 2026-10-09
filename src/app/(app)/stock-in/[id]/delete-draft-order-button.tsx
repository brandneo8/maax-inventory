"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftPurchaseOrder } from "../actions";
import { btnDangerClass } from "@/lib/ui";

export function DeleteDraftOrderButton({ purchaseOrderId, poNumber }: { purchaseOrderId: string; poNumber: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // One click does it once, however fast it's clicked again.
  const busyRef = useRef(false);

  async function run() {
    if (busyRef.current) return;
    const ok = window.confirm(`Delete draft ${poNumber}? This removes it completely and can't be undone.`);
    if (!ok) return;
    busyRef.current = true;
    setPending(true);
    let leaving = false;
    try {
      const result = await deleteDraftPurchaseOrder(purchaseOrderId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      leaving = true;
      router.push("/stock-in");
      router.refresh();
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
    <button className={btnDangerClass} disabled={pending} type="button" onClick={() => void run()}>
      {pending ? "Deleting…" : "Delete draft"}
    </button>
  );
}
