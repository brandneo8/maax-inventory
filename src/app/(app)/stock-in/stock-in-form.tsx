"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { saveStockIn } from "./actions";
import { AddOrderLine, type EditableLine } from "./order-line-row";
import { BulkLineActionsBar } from "./bulk-line-actions";
import { OrderTotals } from "./order-totals";
import { QuickCreateProductModal } from "./quick-create-product-modal";
import { DeleteDraftOrderButton } from "./[id]/delete-draft-order-button";
import { ProductPicker, type ProductOption } from "@/components/product-picker";
import { catalogTax } from "@/lib/catalog-pricing";
import { formatDate, formatMoney, formatQty, singaporeToday } from "@/lib/format";
import { CLASSIFICATIONS, classificationLabel, type ProductClassification } from "@/lib/labels";
import { blurOnWheel, btnClass, btnSecondaryClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type SupplierOption = { id: string; label: string; gstRegistered: boolean };

export type FreeLine = { key: string; product_id: string; classification: ProductClassification; quantity: number };

/** A draft being continued. */
export type StockInDraft = {
  id: string;
  poNumber: string;
  supplierId: string;
  orderDate: string;
  notes: string;
  fxAdjustment: number;
  lines: EditableLine[];
  /** Free goods saved on the draft. */
  freeLines: FreeLine[];
};

const STEPS = [
  { title: "Products and quantities", short: "Quantities" },
  { title: "Prices", short: "Prices" },
  { title: "Invoice, rounding and FX", short: "Invoice and FX" },
] as const;

/** A number box that can be cleared while typing (an empty box reads as 0). */
function NumberInput({
  value,
  onChange,
  step,
  min,
  ariaLabel,
  invalid,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  step: string;
  min: string;
  ariaLabel: string;
  invalid?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={cn(fieldClass, numberFieldClass, invalid && "border-red-400 bg-red-50", className)}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={draft ?? (value === 0 ? "" : String(value))}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      onWheel={blurOnWheel}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const parsed = Number(raw);
        onChange(raw.trim() === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/**
 * Stock-in in one workflow: (1) add the products that arrived and their
 * quantities, (2) confirm their prices, (3) the invoice, rounding and FX —
 * then Receive. It can be saved as a draft at any step and picked up later;
 * a draft is the only stage before Received.
 */
export function StockInForm({
  branchName,
  suppliers,
  products: initialProducts,
  gstRate,
  latestCountDate = null,
  draft = null,
}: {
  branchName: string;
  suppliers: SupplierOption[];
  products: ProductOption[];
  gstRate: number;
  /** This salon's latest confirmed count — a receipt dated before it gets trued up against it. */
  latestCountDate?: string | null;
  draft?: StockInDraft | null;
}) {
  const router = useRouter();
  const today = useMemo(() => singaporeToday(), []);
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState(initialProducts);
  const [supplierId, setSupplierId] = useState(draft?.supplierId ?? "");
  const [orderDate, setOrderDate] = useState(draft?.orderDate || today);
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(draft?.lines ?? []);
  const [freeLines, setFreeLines] = useState<FreeLine[]>(draft?.freeLines ?? []);
  const [receivedDate, setReceivedDate] = useState(today);
  const [invoiceReference, setInvoiceReference] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [roundingText, setRoundingText] = useState("");
  const [fxText, setFxText] = useState(draft?.fxAdjustment ? String(draft.fxAdjustment) : "");
  const [freeProductId, setFreeProductId] = useState("");
  const [freeQuantity, setFreeQuantity] = useState(1);
  const [creatingProduct, setCreatingProduct] = useState<"line" | "free" | null>(null);
  const [createName, setCreateName] = useState("");
  const [selectLineProductId, setSelectLineProductId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"draft" | "receive" | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const supplier = suppliers.find((option) => option.id === supplierId);
  const gstRegistered = supplier?.gstRegistered ?? false;
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  // Every product in the catalog can be received, whichever supplier or salon it's tagged to.
  const offList = lines.filter((line) => productById.get(line.product_id)?.onSalonList === false).length;
  const rounding = Number(roundingText) || 0;
  const fx = Number(fxText) || 0;
  const totalQuantity =
    lines.reduce((sum, line) => sum + line.quantity_ordered, 0) + freeLines.reduce((sum, line) => sum + line.quantity, 0);
  const uniqueSkuCount = new Set([...lines.map((line) => line.product_id), ...freeLines.map((line) => line.product_id)])
    .size;
  const beforeLatestCount = Boolean(latestCountDate && receivedDate && receivedDate < latestCountDate);

  const previewUrl = useMemo(() => (invoiceFile ? URL.createObjectURL(invoiceFile) : null), [invoiceFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /** What stops each step from going on, if anything. */
  // Unsaved changes: anything differs from what was loaded. Refreshing or
  // closing the tab then asks first, since nothing here is kept until it's saved.
  const snapshot = JSON.stringify({
    supplierId,
    orderDate,
    notes,
    lines,
    freeLines,
    receivedDate,
    invoiceReference,
    roundingText,
    fxText,
    invoice: invoiceFile?.name ?? null,
  });
  const [savedSnapshot] = useState(snapshot);
  const unsaved = snapshot !== savedSnapshot;
  useEffect(() => {
    if (!unsaved) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      // Saving or receiving moves on to the order; don't ask then.
      if (busyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  const stepProblems = [
    !supplierId
      ? "Select a supplier."
      : lines.length === 0
        ? "Add at least one product."
        : lines.some((line) => !(line.quantity_ordered > 0))
          ? "Every line needs a quantity above zero."
          : freeLines.some((line) => !(line.quantity > 0))
            ? "Every free product needs a quantity above zero (or remove it)."
            : null,
    lines.some((line) => !(line.unit_price >= 0)) ? "Prices can't be negative." : null,
    !receivedDate
      ? "Enter the received date."
      : receivedDate > today
        ? `The received date can't be in the future (today is ${formatDate(today)}).`
        : null,
  ];
  const firstProblemStep = stepProblems.findIndex((problem) => problem);

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function goTo(next: number) {
    // Moving forward checks every step on the way.
    const blocked = stepProblems.slice(0, next).findIndex((problem) => problem);
    if (next > step && blocked >= 0) {
      setStep(blocked);
      setError(stepProblems[blocked]);
      return;
    }
    setError(null);
    setStep(next);
  }

  /** Enter in a box (or a barcode scanner) shouldn't jump steps or save — only the buttons do. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) event.preventDefault();
  }

  function addFreeLine() {
    const product = productById.get(freeProductId);
    if (!product || !(freeQuantity > 0)) return;
    setFreeLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        product_id: product.id,
        classification: product.defaultClassification ?? "gwp",
        quantity: freeQuantity,
      },
    ]);
    setFreeProductId("");
    setFreeQuantity(1);
  }

  async function save(mode: "draft" | "receive") {
    if (busyRef.current) return;
    if (mode === "draft" ? Boolean(stepProblems[0]) : firstProblemStep >= 0) {
      const problemStep = mode === "draft" ? 0 : firstProblemStep;
      setStep(problemStep);
      setError(stepProblems[problemStep]);
      setConfirming(false);
      return;
    }
    busyRef.current = true;
    setBusy(mode);
    setError(null);
    setConfirming(false);
    let leaving = false;
    try {
      const result = await saveStockIn(
        {
          mode,
          order_id: draft?.id ?? null,
          supplier_id: supplierId,
          order_date: orderDate,
          notes,
          fx_adjustment: fx,
          lines: lines.map((line) => ({
            product_id: line.product_id,
            classification: line.classification,
            quantity: line.quantity_ordered,
            unit_price: line.unit_price,
          })),
          // A draft keeps its free goods too; receiving books them at $0.
          free_lines: freeLines.map(({ product_id, classification, quantity }) => ({ product_id, classification, quantity })),
          received_date: receivedDate,
          invoice_reference: invoiceReference,
          rounding_adjustment: rounding,
        },
        mode === "receive" ? invoiceFile : null,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.warning) window.alert(result.warning);
      leaving = true;
      router.push(`/stock-in/${result.orderId}`);
      router.refresh();
    } catch {
      setError(
        mode === "receive"
          ? "Could not reach the server. Check your connection, then open Stock-in to see whether it was received before trying again."
          : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      if (!leaving) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  const linesTable = (mode: "quantity" | "price") => (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>SKU</th>
            <th className={thClass}>Product</th>
            <th className={thClass}>Size</th>
            <th className={thClass}>Type</th>
            <th className={cn(thClass, "text-right")}>Quantity</th>
            {mode === "price" ? (
              <>
                <th className={cn(thClass, "text-right")}>Unit price</th>
                <th className={cn(thClass, "text-right")}>Avg paid here</th>
                <th className={cn(thClass, "text-right")}>Price incl. GST</th>
                <th className={cn(thClass, "text-right")}>Total</th>
              </>
            ) : (
              <th className={thClass}>
                <span className="sr-only">Remove</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className={cn(tdClass, "text-muted")} colSpan={mode === "price" ? 9 : 6}>
                Search for a product above to add it.
              </td>
            </tr>
          ) : null}
          {lines.map((line) => {
            const product = productById.get(line.product_id);
            const label = product?.label ?? "Unknown product";
            return (
              <tr key={line.key}>
                <td className={cn(tdClass, "text-muted")}>{product?.sku || "—"}</td>
                <td className={tdClass}>
                  {label}
                  {product?.onSalonList === false ? (
                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900">
                      New to {branchName}
                    </span>
                  ) : null}
                </td>
                <td className={tdClass}>{product?.sizeLabel || "—"}</td>
                <td className={tdClass}>
                  {mode === "quantity" ? (
                    <select
                      className={cn(fieldClass, "w-auto py-1.5")}
                      value={line.classification}
                      onChange={(event) =>
                        updateLine(line.key, { classification: event.target.value as ProductClassification })
                      }
                      aria-label={`Type of ${label}`}
                    >
                      {CLASSIFICATIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    classificationLabel(line.classification)
                  )}
                </td>
                <td className={cn(tdClass, "text-right tabular-nums")}>
                  {mode === "quantity" ? (
                    <NumberInput
                      className="ml-auto w-24"
                      value={line.quantity_ordered}
                      step="1"
                      min="1"
                      invalid={!(line.quantity_ordered > 0)}
                      ariaLabel={`Quantity of ${label}`}
                      onChange={(quantity) => updateLine(line.key, { quantity_ordered: quantity })}
                    />
                  ) : (
                    formatQty(line.quantity_ordered)
                  )}
                </td>
                {mode === "price" ? (
                  <>
                    <td className={cn(tdClass, "text-right")}>
                      <NumberInput
                        className="ml-auto w-28"
                        value={line.unit_price}
                        step="0.01"
                        min="0"
                        ariaLabel={`Unit price of ${label}`}
                        onChange={(price) => updateLine(line.key, { unit_price: price })}
                      />
                    </td>
                    <td className={cn(tdClass, "text-right tabular-nums text-muted")}>
                      {product?.branchAvgCost != null ? formatMoney(product.branchAvgCost) : "—"}
                    </td>
                    <td className={cn(tdClass, "text-right tabular-nums")}>
                      {formatMoney(catalogTax(line.unit_price, gstRegistered, gstRate).unitCostWithTax)}
                    </td>
                    <td className={cn(tdClass, "text-right tabular-nums")}>
                      {formatMoney(line.unit_price * line.quantity_ordered)}
                    </td>
                  </>
                ) : (
                  <td className={tdClass}>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      aria-label={`Remove ${label}`}
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6" onKeyDown={onKeyDown}>
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((item, index) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => goTo(index)}
              aria-current={step === index ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                step === index
                  ? "border-slate-900 bg-slate-900 text-white"
                  : index < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-border bg-card text-muted",
              )}
            >
              <span className="tabular-nums">{index + 1}</span>
              {item.short}
            </button>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {step + 1}. {STEPS[step].title}
        </h2>

        {step === 0 ? (
          <>
            <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span>Supplier</span>
                <select
                  id="stock-in-supplier"
                  className={fieldClass}
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="" disabled>
                    Select supplier
                  </option>
                  {suppliers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Order date</span>
                <input
                  id="stock-in-order-date"
                  className={fieldClass}
                  type="date"
                  value={orderDate}
                  onChange={(event) => setOrderDate(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Notes</span>
                <input
                  id="stock-in-notes"
                  className={fieldClass}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>

            <p className="text-xs text-muted">
              Search the whole catalog. A product that isn&apos;t on {branchName}&apos;s list yet is added to it (and to
              its POS list) when you receive.
            </p>
            <AddOrderLine
              products={products}
              onAdd={(line) => setLines((current) => [...current, line])}
              selectProductId={selectLineProductId}
              onAddNewProduct={(query) => {
                setCreateName(query);
                setCreatingProduct("line");
              }}
            />
            {offList > 0 ? (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                {offList} {offList === 1 ? "product isn't" : "products aren't"} on {branchName}&apos;s list yet —{" "}
                {offList === 1 ? "it'll be" : "they'll be"} added when you receive.
              </p>
            ) : null}
            {linesTable("quantity")}

            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h3 className="font-semibold">Free goods (optional)</h3>
                <p className="text-sm text-muted">
                  Testers, GWP or other products that arrived at no charge. They&apos;re received at $0.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-64 flex-1 space-y-1 text-sm">
                  <span>Search product</span>
                  <ProductPicker
                    products={products}
                    value={freeProductId}
                    onSelect={(product) => setFreeProductId(product.id)}
                    onAddNewProduct={(query) => {
                      setCreateName(query);
                      setCreatingProduct("free");
                    }}
                  />
                </label>
                <label className="w-28 space-y-1 text-sm">
                  <span>Quantity</span>
                  <NumberInput
                    value={freeQuantity}
                    step="1"
                    min="1"
                    ariaLabel="Free goods quantity"
                    onChange={(quantity) => setFreeQuantity(Math.round(quantity))}
                  />
                </label>
                <button
                  className={btnClass}
                  type="button"
                  onClick={addFreeLine}
                  disabled={!freeProductId || !(freeQuantity > 0)}
                >
                  Add
                </button>
              </div>
              {freeLines.length > 0 ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {freeLines.map((line) => (
                    <li key={line.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        {productById.get(line.product_id)?.label ?? "Unknown product"} ·{" "}
                        {classificationLabel(line.classification)} · at $0.00
                      </span>
                      <NumberInput
                        className="w-24"
                        value={line.quantity}
                        step="1"
                        min="1"
                        invalid={!(line.quantity > 0)}
                        ariaLabel={`Quantity of free ${productById.get(line.product_id)?.label ?? "product"}`}
                        onChange={(quantity) =>
                          setFreeLines((current) =>
                            current.map((item) => (item.key === line.key ? { ...item, quantity: Math.round(quantity) } : item)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-red-600 hover:bg-red-50 hover:text-red-800"
                        onClick={() => setFreeLines((current) => current.filter((item) => item.key !== line.key))}
                        aria-label="Remove free product"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <p className="text-sm text-muted">
              Enter each product&apos;s price from the supplier&apos;s invoice (before GST). The bulk actions apply to
              every line.
            </p>
            <BulkLineActionsBar
              onApplyAvgCost={() =>
                setLines((current) =>
                  current.map((line) => {
                    const average = productById.get(line.product_id)?.branchAvgCost;
                    return average != null ? { ...line, unit_price: average } : line;
                  }),
                )
              }
              onApplyDiscount={(percent) => {
                const factor = 1 - Math.min(100, Math.max(0, percent)) / 100;
                setLines((current) =>
                  current.map((line) => ({ ...line, unit_price: Math.round(line.unit_price * factor * 100) / 100 })),
                );
              }}
              onSetQuantity={(quantity) =>
                setLines((current) => current.map((line) => ({ ...line, quantity_ordered: quantity })))
              }
              onSetUnitPrice={(price) => setLines((current) => current.map((line) => ({ ...line, unit_price: price })))}
            />
            {linesTable("price")}
            <OrderTotals lines={lines} gstRegistered={gstRegistered} gstRate={gstRate} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span>Received date</span>
                <input
                  id="stock-in-received-date"
                  className={fieldClass}
                  type="date"
                  max={today}
                  value={receivedDate}
                  onChange={(event) => setReceivedDate(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Invoice reference</span>
                <input
                  id="stock-in-invoice-reference"
                  className={fieldClass}
                  value={invoiceReference}
                  placeholder="Invoice number"
                  onChange={(event) => setInvoiceReference(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Invoice file (optional)</span>
                <input
                  id="stock-in-invoice-file"
                  className={fieldClass}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {beforeLatestCount && latestCountDate ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                This receipt is dated before the stock count confirmed on {formatDate(latestCountDate)}. The counted
                balances stay exactly as counted: where the count found extra stock, this receipt is treated as that
                stock (so it gets its real cost instead of $0); anything beyond that is added to the count&apos;s
                shortfall. Costs are corrected automatically.
              </p>
            ) : null}

            {invoiceFile && previewUrl ? (
              invoiceFile.type === "application/pdf" ? (
                <p className="text-sm">📄 {invoiceFile.name}</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Invoice preview"
                  className="max-h-[32rem] w-full rounded-lg border border-border bg-white object-contain"
                />
              )
            ) : null}

            <div>
              <p className="mb-2 text-sm font-medium text-muted">
                Invoice total for the quantities and prices entered — check it against the supplier&apos;s invoice.
              </p>
              <OrderTotals
                lines={lines}
                gstRegistered={gstRegistered}
                gstRate={gstRate}
                adjustmentInput={{ value: roundingText, onChange: setRoundingText }}
                fxInput={{ value: fxText, onChange: setFxText }}
                totalQuantity={totalQuantity}
                uniqueSkuCount={uniqueSkuCount}
              />
              <p className="mt-1 ml-auto max-w-xs text-right text-xs text-muted">
                Use rounding and FX clearing to make the total match the invoice (+ adds cost, − reduces it). Rounding
                counts as cost of goods sold; FX clearing is reported as realised FX. Neither changes product costs.
              </p>
            </div>
          </>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {step > 0 ? (
          <button className={btnSecondaryClass} type="button" onClick={() => goTo(step - 1)} disabled={Boolean(busy)}>
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button className={btnClass} type="button" onClick={() => goTo(step + 1)} disabled={Boolean(busy)}>
            Next: {STEPS[step + 1].short}
          </button>
        ) : (
          <button
            className={btnClass}
            type="button"
            onClick={() => (firstProblemStep >= 0 ? void save("receive") : setConfirming(true))}
            disabled={Boolean(busy)}
          >
            {busy === "receive" ? "Receiving…" : "Receive into stock"}
          </button>
        )}
        <button className={btnSecondaryClass} type="button" onClick={() => void save("draft")} disabled={Boolean(busy)}>
          {busy === "draft" ? "Saving…" : draft ? "Save draft" : "Save as draft"}
        </button>
        {draft ? (
          <span className="ml-auto">
            <DeleteDraftOrderButton purchaseOrderId={draft.id} poNumber={draft.poNumber} />
          </span>
        ) : null}
        <p className="basis-full text-xs text-muted">
          {draft ? `${draft.poNumber} is a draft at ${branchName}` : `Working in ${branchName}`}. Stock only changes
          when you receive. A draft keeps your products, quantities, prices and FX.
        </p>
      </div>

      {creatingProduct ? (
        <QuickCreateProductModal
          defaultClassification={creatingProduct === "free" ? "gwp" : "retail"}
          initialName={createName}
          onClose={() => setCreatingProduct(null)}
          onCreated={(product, classification) => {
            setProducts((current) => [
              ...current,
              {
                id: product.id,
                label: product.label,
                sku: product.sku ?? null,
                sizeLabel: product.sizeLabel ?? null,
                defaultClassification: classification,
                unitCost: product.unitCost,
                branchAvgCost: null,
                onSalonList: true,
              },
            ]);
            if (creatingProduct === "free") setFreeProductId(product.id);
            else setSelectLineProductId(product.id);
            setCreatingProduct(null);
          }}
        />
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-receive-title"
            className="w-full max-w-lg rounded-xl border border-border bg-white p-4 shadow-lg"
          >
            <h2 id="confirm-receive-title" className="text-lg font-semibold">
              Receive into stock?
            </h2>
            <p className="mt-1 text-sm text-muted">
              {supplier?.label} · received {formatDate(receivedDate)}. This adds {formatQty(totalQuantity)} units (
              {uniqueSkuCount} {uniqueSkuCount === 1 ? "product" : "products"}) to stock at {branchName}. The receipt
              can be edited or removed afterwards, but not partly received.
            </p>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Product</th>
                    <th className={cn(thClass, "text-right")}>Qty</th>
                    <th className={cn(thClass, "text-right")}>Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td className={tdClass}>{productById.get(line.product_id)?.label ?? "Unknown product"}</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>{formatQty(line.quantity_ordered)}</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>{formatMoney(line.unit_price)}</td>
                    </tr>
                  ))}
                  {freeLines.map((line) => (
                    <tr key={line.key}>
                      <td className={tdClass}>{productById.get(line.product_id)?.label ?? "Unknown product"} (free)</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>{formatQty(line.quantity)}</td>
                      <td className={cn(tdClass, "text-right tabular-nums")}>$0.00</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <OrderTotals
                lines={lines}
                gstRegistered={gstRegistered}
                gstRate={gstRate}
                adjustment={rounding}
                fxAdjustment={fx}
                totalQuantity={totalQuantity}
                uniqueSkuCount={uniqueSkuCount}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnSecondaryClass} type="button" onClick={() => setConfirming(false)}>
                Go back
              </button>
              <button className={btnClass} type="button" disabled={Boolean(busy)} onClick={() => void save("receive")}>
                Confirm &amp; receive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
