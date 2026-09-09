"use client";

import { useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { deleteInventoryCount, voidInventoryCount } from "./actions";
import { btnDangerClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function CountRecordAction({
  countId,
  kind,
  compact = false,
}: {
  countId: string;
  kind: "delete" | "void";
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const deleting = kind === "delete";

  async function onSubmit(formData: FormData) {
    const ok = window.confirm(
      deleting
        ? "Delete this draft count? It will be removed from the list."
        : "Void this confirmed count? It will stay on the list as voided, and its stock adjustments will be reversed.",
    );
    if (!ok) return;
    setPending(true);
    try {
      if (deleting) {
        await deleteInventoryCount(formData);
        return;
      }
      await voidInventoryCount(formData);
      router.refresh();
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(
        err instanceof Error
          ? err.message
          : deleting
            ? "Could not delete the count."
            : "Could not void the count.",
      );
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="count_id" value={countId} />
      <button
        className={cn(btnDangerClass, compact && "px-2 py-1 text-xs")}
        disabled={pending}
        type="submit"
      >
        {pending ? (deleting ? "Deleting…" : "Voiding…") : deleting ? "Delete" : "Void"}
      </button>
    </form>
  );
}
