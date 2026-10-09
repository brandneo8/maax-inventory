"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrderFormCurrency } from "@/app/(app)/admin/suppliers/order-form-actions";
import type { BrandOrderForm } from "@/lib/data/order-forms";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Form = NonNullable<BrandOrderForm["form"]>;

/**
 * The currency of a brand's order form. Prices in another currency are
 * converted to SGD at the rate entered here before they're compared with
 * Pulse. Asks for a rate when the spreadsheet names another currency.
 */
export function OrderFormCurrency({
  supplierId,
  brandId,
  form,
}: {
  supplierId: string;
  brandId: string;
  form: Form;
}) {
  const router = useRouter();
  const converted = form.fxRate != null && form.currency != null;
  const needsRate =
    form.detectedCurrency != null &&
    form.detectedCurrency !== "SGD" &&
    !(converted && form.currency === form.detectedCurrency) &&
    form.currency !== "SGD";
  const [editing, setEditing] = useState(false);
  const [currency, setCurrency] = useState(
    form.currency && form.currency !== "SGD" ? form.currency : (form.detectedCurrency ?? ""),
  );
  const [rate, setRate] = useState(form.fxRate != null ? String(form.fxRate) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(code: string, fxRate: number | null) {
    setPending(true);
    setError(null);
    try {
      await setOrderFormCurrency(supplierId, brandId, code, fxRate);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the exchange rate.");
    } finally {
      setPending(false);
    }
  }

  const code = currency.trim().toUpperCase() || "…";
  const editor = (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(currency, Number(rate));
      }}
    >
      <label className="space-y-1 text-sm">
        <span className="block">Currency</span>
        <input
          className={cn(fieldClass, "w-20 uppercase")}
          value={currency}
          maxLength={3}
          onChange={(event) => setCurrency(event.target.value)}
          placeholder="MYR"
          aria-label="Order form currency"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block">1 {code} = SGD</span>
        <input
          className={cn(fieldClass, "w-28 text-right")}
          inputMode="decimal"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          placeholder="0.29"
          aria-label={`SGD per 1 ${code}`}
        />
      </label>
      <button
        type="submit"
        className={btnClass}
        disabled={pending || !currency.trim() || !rate.trim()}
      >
        {pending ? "Saving…" : "Convert prices"}
      </button>
      <button
        type="button"
        className={btnSecondaryClass}
        disabled={pending}
        onClick={() => void save("SGD", null)}
      >
        Prices are in SGD
      </button>
      {editing ? (
        <button
          type="button"
          className="text-sm text-muted underline"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      ) : null}
    </form>
  );

  if (needsRate || editing) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-sm text-amber-900">
          {needsRate && !editing ? (
            <>
              This order form&apos;s prices look like they&apos;re in{" "}
              <strong>{form.detectedCurrency}</strong>. Enter the exchange rate so its price and RRP
              are converted to SGD before they&apos;re compared with Pulse.
            </>
          ) : (
            "Enter the currency of this order form's prices and its exchange rate to SGD."
          )}
        </p>
        {editor}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted">
      {converted ? (
        <>
          Prices converted from <strong>{form.currency}</strong> at 1 {form.currency} ={" "}
          {form.fxRate} SGD.{" "}
        </>
      ) : null}
      <button type="button" className="underline" onClick={() => setEditing(true)}>
        {converted ? "Change rate" : "Prices not in SGD?"}
      </button>
    </p>
  );
}
