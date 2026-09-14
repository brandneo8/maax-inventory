"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { markPurchaseOrderSent } from "../actions";
import { ORDER_SENDER_NAMES } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";

export function MarkSentButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [open, setOpen] = useState(false);
  const [sentBy, setSentBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [sentDate, setSentDate] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setSentBy("");
    setRemarks("");
    setSentDate(today);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!sentBy) {
      setError("Select who is sending this order.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await markPurchaseOrderSent({ id: purchaseOrderId, sentBy, remarks, sentDate });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this order sent.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className={btnClass} type="button" onClick={openModal}>
        Mark sent
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white p-4 shadow-lg">
            <h2 className="text-lg font-semibold">Mark order sent</h2>
            <p className="mt-1 text-sm text-muted">Record who is sending this order to the supplier.</p>

            {error ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            ) : null}

            <div className="mt-3 space-y-3">
              <label className="block space-y-1 text-sm">
                <span>Sent by</span>
                <select
                  className={fieldClass}
                  value={sentBy}
                  onChange={(event) => setSentBy(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select who is sending
                  </option>
                  {ORDER_SENDER_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Sent date</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={sentDate}
                  onChange={(event) => setSentDate(event.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Remarks</span>
                <textarea
                  className={fieldClass}
                  rows={3}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={btnSecondaryClass} type="button" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
              <button className={btnClass} type="button" onClick={() => void submit()} disabled={pending}>
                {pending ? "Marking sent…" : "Mark sent"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
