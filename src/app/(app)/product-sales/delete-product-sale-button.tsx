"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteProductSale } from "./actions";
import { btnDangerClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function DeleteProductSaleButton({ saleId, compact = false }: { saleId: string; compact?: boolean }) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    const ok = window.confirm("Delete this product sale? It will be removed and its stock deduction reversed.");
    if (!ok) return;
    setPending(true);
    try {
      await deleteProductSale(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not delete this product sale.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="sale_id" value={saleId} />
      <button className={cn(btnDangerClass, compact && "px-2 py-1 text-xs")} disabled={pending} type="submit">
        {pending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
