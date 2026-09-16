"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { duplicateInventoryCount } from "./actions";
import { btnSecondaryClass } from "@/lib/ui";

export function DuplicateCountButton({ countId }: { countId: string }) {
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    try {
      await duplicateInventoryCount(formData);
    } catch (err) {
      unstable_rethrow(err);
      setPending(false);
      window.alert(err instanceof Error ? err.message : "Could not duplicate this count.");
    }
  }

  return (
    <form action={onSubmit}>
      <input type="hidden" name="count_id" value={countId} />
      <button className={btnSecondaryClass} disabled={pending} type="submit">
        {pending ? "Duplicating…" : "Duplicate count"}
      </button>
    </form>
  );
}
