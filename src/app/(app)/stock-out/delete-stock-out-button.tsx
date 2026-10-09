"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const deletingRef = useRef(false);

  async function remove() {
    if (deletingRef.current) return;
    const ok = window.confirm("Delete this stock-out? It will be removed and its stock deduction reversed.");
    if (!ok) return;
    deletingRef.current = true;
    setPending(true);
    try {
      const result = await deleteStockOutReport(reportId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.push("/stock-out");
      router.refresh();
    } catch {
      window.alert("Could not reach the server. Check your connection and try again.");
    } finally {
      deletingRef.current = false;
      setPending(false);
    }
  }

  return (
    <button
      className={cn(btnDangerClass, compact && "px-2 py-1 text-xs")}
      disabled={pending}
      type="button"
      onClick={() => void remove()}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
