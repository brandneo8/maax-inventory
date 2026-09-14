"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { receivePurchaseOrder } from "../../actions";
import { blurOnWheel, btnClass, btnSecondaryClass, fieldClass, numberFieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { formatMoney, formatQty } from "@/lib/format";
import { classificationLabel, type ProductClassification } from "@/lib/labels";
import { ProductPicker, type Option } from "@/components/product-picker";
import { QuickCreateProductModal } from "./quick-create-product-modal";
import { OrderTotals } from "../../order-totals";
import { BulkLineActionsBar } from "../../bulk-line-actions";
import { catalogTax } from "@/lib/catalog-pricing";
import { cn } from "@/lib/utils";

type Line = {
  purchase_order_item_id: string;
  product_id: string;
  sku: string | null;
  sizeLabel: string | null;
  label: string;
  classification: ProductClassification;
  ordered: number;
  ordered_unit_price: number;
  remaining: number;
  unit_cost: number;
  branchAvgCost: number | null;
  store_location_id: string;
  quantity_received: number;
  contents: { label: string; quantity: number }[];
};

type FreeGoodsProduct = Option & { defaultClassification: ProductClassification | null };

type FreeLine = {
  key: string;
  product_id: string;
  label: string;
  classification: ProductClassification;
  quantity_received: number;
};

function AddFreeGoodsLine({
  products,
  onAdd,
  onProductCreated,
}: {
  products: FreeGoodsProduct[];
  onAdd: (line: FreeLine) => void;
  onProductCreated: (product: FreeGoodsProduct) => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const selected = products.find((product) => product.id === productId);
  const canAdd = Boolean(selected) && quantity > 0;

  function handleAdd() {
    if (!selected || !canAdd) return;
    onAdd({
      key: crypto.randomUUID(),
      product_id: selected.id,
      label: selected.label,
      classification: selected.defaultClassification ?? "gwp",
      quantity_received: quantity,
    });
    setProductId("");
    setQuantity(1);
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <label className="min-w-64 flex-1 space-y-1 text-sm">
          <span>Search product</span>
          <ProductPicker products={products} value={productId} onSelect={(product) => setProductId(product.id)} />
        </label>
        <label className="w-28 space-y-1 text-sm">
          <span>Quantity</span>
          <input
            className={cn(fieldClass, numberFieldClass)}
            type="number"
            min="0"
            step="1"
            value={quantity === 0 ? "" : quantity}
            onWheel={blurOnWheel}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                setQuantity(0);
                return;
              }
              const parsed = Math.round(Number(raw));
              if (Number.isFinite(parsed)) setQuantity(Math.max(0, parsed));
            }}
          />
        </label>
        <button className={btnClass} type="button" onClick={handleAdd} disabled={!canAdd}>
          Add
        </button>
        <button className={btnSecondaryClass} type="button" onClick={() => setShowCreate(true)}>
          Create product
        </button>
      </div>

      {showCreate ? (
        <QuickCreateProductModal
          defaultClassification="gwp"
          onClose={() => setShowCreate(false)}
          onCreated={(product) => {
            onProductCreated({ ...product, defaultClassification: null });
            setProductId(product.id);
            setShowCreate(false);
          }}
        />
      ) : null}
    </>
  );
}

export function ReceiveForm({
  purchaseOrderId,
  defaultLocationId,
  gstRegistered,
  gstRate,
  products: initialProducts,
  lines: initialLines,
}: {
  purchaseOrderId: string;
  defaultLocationId: string;
  gstRegistered: boolean;
  gstRate: number;
  products: FreeGoodsProduct[];
  lines: Omit<Line, "store_location_id" | "quantity_received">[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [products, setProducts] = useState<FreeGoodsProduct[]>(initialProducts);
  const [lines, setLines] = useState<Line[]>(
    initialLines.map((line) => ({
      ...line,
      store_location_id: defaultLocationId,
      quantity_received: 0,
    })),
  );
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [roundingAdjustmentText, setRoundingAdjustmentText] = useState("");
  const roundingAdjustment = Number(roundingAdjustmentText) || 0;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  const previewUrl = useMemo(() => (invoiceFile ? URL.createObjectURL(invoiceFile) : null), [invoiceFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function markAllReceived() {
    setLines((current) =>
      current.map((line) => ({ ...line, quantity_received: line.remaining > 0 ? line.remaining : 0 })),
    );
  }

  function applyAvgCostToAll() {
    setLines((current) =>
      current.map((line) => (line.branchAvgCost != null ? { ...line, unit_cost: line.branchAvgCost } : line)),
    );
  }

  function applyBulkDiscount(percent: number) {
    const factor = 1 - Math.min(100, Math.max(0, percent)) / 100;
    setLines((current) =>
      current.map((line) => ({ ...line, unit_cost: Math.round(line.unit_cost * factor * 100) / 100 })),
    );
  }

  function applyBulkQuantity(qty: number) {
    setLines((current) => current.map((line) => ({ ...line, quantity_received: qty })));
  }

  function applyBulkUnitPrice(price: number) {
    setLines((current) => current.map((line) => ({ ...line, unit_cost: price })));
  }

  function removeFreeLine(key: string) {
    setFreeLines((current) => current.filter((line) => line.key !== key));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Deliberately a plain onSubmit (not the `action` prop): this step only
    // captures a snapshot to review in the confirm modal and returns
    // instantly — with `action`, React treats that as "the action finished"
    // and resets every uncontrolled field in the form right away, which
    // looked like the date/invoice reference/attachment had been cleared
    // even though the captured snapshot (and the real submission) were fine.
    event.preventDefault();
    setPendingFormData(new FormData(event.currentTarget));
  }

  async function confirmReceive() {
    const formData = pendingFormData;
    if (!formData) return;
    setPendingFormData(null);
    setPending(true);
    setError(null);
    try {
      await receivePurchaseOrder(
        {
          purchase_order_id: purchaseOrderId,
          received_date: String(formData.get("received_date") ?? ""),
          notes: String(formData.get("notes") ?? ""),
          invoice_reference: String(formData.get("invoice_reference") ?? ""),
          rounding_adjustment: roundingAdjustment,
          lines: [
            ...lines.map((line) => ({
              purchase_order_item_id: line.purchase_order_item_id,
              product_id: line.product_id,
              store_location_id: defaultLocationId,
              quantity_received: line.quantity_received,
              unit_cost: line.unit_cost,
              classification: null,
            })),
            ...freeLines.map((line) => ({
              purchase_order_item_id: null,
              product_id: line.product_id,
              store_location_id: defaultLocationId,
              quantity_received: line.quantity_received,
              unit_cost: 0,
              classification: line.classification,
            })),
          ],
        },
        invoiceFile,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not receive this order.");
      setPending(false);
    }
  }

  const receivingLines = lines.filter((line) => line.quantity_received > 0);
  const skippedLines = lines.filter((line) => line.quantity_received <= 0);
  const receivingFreeLines = freeLines.filter((line) => line.quantity_received > 0);
  const linesTotalQty = lines.reduce((sum, line) => sum + (Number(line.quantity_received) || 0), 0);
  const freeLinesTotalQty = freeLines.reduce((sum, line) => sum + (Number(line.quantity_received) || 0), 0);
  const combinedTotalQty = linesTotalQty + freeLinesTotalQty;
  const uniqueSkuCount = new Set([
    ...receivingLines.map((line) => line.product_id),
    ...receivingFreeLines.map((line) => line.product_id),
  ]).size;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted">Received date</span>
            <input className={fieldClass} type="date" name="received_date" defaultValue={today} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Notes</span>
            <input className={fieldClass} name="notes" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Invoice reference</span>
            <input className={fieldClass} name="invoice_reference" placeholder="Invoice number" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Invoice attachment</span>
            <input
              className={fieldClass}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Rounding / adjustment</span>
            <input
              className={cn(fieldClass, numberFieldClass)}
              type="number"
              step="0.01"
              value={roundingAdjustmentText}
              onWheel={blurOnWheel}
              onChange={(event) => setRoundingAdjustmentText(event.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-sm text-muted">Compare the uploaded invoice against what you enter below.</p>
          {invoiceFile ? (
            invoiceFile.type === "application/pdf" ? (
              <p className="mt-2 text-sm">📄 {invoiceFile.name}</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl ?? undefined}
                alt="Invoice preview"
                className="mt-2 max-h-[32rem] w-full rounded-lg border border-border bg-white object-contain"
              />
            )
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Lines</h2>
          <button className={btnSecondaryClass} type="button" onClick={markAllReceived}>
            Mark all as received
          </button>
        </div>

        <BulkLineActionsBar
          onApplyAvgCost={applyAvgCostToAll}
          onApplyDiscount={applyBulkDiscount}
          onSetQuantity={applyBulkQuantity}
          onSetUnitPrice={applyBulkUnitPrice}
          qtyMin={0}
        />

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={cn(tableClass, "table-fixed")}>
            <thead>
              <tr>
                <th className={cn(thClass, "w-[12%]")}>SKU</th>
                <th className={cn(thClass, "w-[24%]")}>Product</th>
                <th className={thClass}>Size</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Ordered</th>
                <th className={thClass}>Received</th>
                <th className={thClass}>Unit price</th>
                <th className={thClass}>Invoice price</th>
                <th className={thClass}>Avg paid here</th>
                <th className={thClass}>Total price</th>
                <th className={thClass}>Total incl. tax</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const totalPrice = line.quantity_received * line.unit_cost;
                const totalPriceInclTax = catalogTax(line.unit_cost, gstRegistered, gstRate).unitCostWithTax * line.quantity_received;
                return (
                  <tr key={line.purchase_order_item_id}>
                    <td className={tdClass}>{line.sku || "—"}</td>
                    <td className={tdClass}>
                      {line.label}
                      {line.contents.length > 0 ? (
                        <p className="mt-0.5 text-xs text-muted">
                          Adds{" "}
                          {line.contents
                            .map((item) => `${(line.quantity_received || 0) * item.quantity}× ${item.label}`)
                            .join(", ")}
                          .
                        </p>
                      ) : null}
                    </td>
                    <td className={tdClass}>{line.sizeLabel || "—"}</td>
                    <td className={tdClass}>{classificationLabel(line.classification)}</td>
                    <td className={tdClass}>{formatQty(line.ordered)}</td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, numberFieldClass)}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity_received === 0 ? "" : line.quantity_received}
                        onWheel={blurOnWheel}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            updateLine(index, { quantity_received: 0 });
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed)) updateLine(index, { quantity_received: Math.max(0, parsed) });
                        }}
                      />
                    </td>
                    <td className={tdClass}>{formatMoney(line.ordered_unit_price)}</td>
                    <td className={tdClass}>
                      <input
                        className={cn(fieldClass, numberFieldClass)}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unit_cost === 0 ? "" : line.unit_cost}
                        onWheel={blurOnWheel}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            updateLine(index, { unit_cost: 0 });
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed)) updateLine(index, { unit_cost: Math.max(0, parsed) });
                        }}
                      />
                    </td>
                    <td className={tdClass}>{line.branchAvgCost != null ? formatMoney(line.branchAvgCost) : "—"}</td>
                    <td className={tdClass}>{formatMoney(totalPrice)}</td>
                    <td className={tdClass}>{formatMoney(totalPriceInclTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Free goods received</h2>
          <p className="text-sm text-muted">
            Add products that arrived at no charge (testers, GWP). These are always recorded at $0.
          </p>
        </div>
        <AddFreeGoodsLine
          products={products}
          onAdd={(line) => setFreeLines((current) => [...current, line])}
          onProductCreated={(product) => setProducts((current) => [...current, product])}
        />
        {freeLines.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Product</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Quantity</th>
                  <th className={thClass}>Unit cost</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {freeLines.map((line) => (
                  <tr key={line.key}>
                    <td className={tdClass}>{line.label}</td>
                    <td className={tdClass}>{classificationLabel(line.classification)}</td>
                    <td className={tdClass}>{formatQty(line.quantity_received)}</td>
                    <td className={tdClass}>$0.00</td>
                    <td className={tdClass}>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => removeFreeLine(line.key)}
                        aria-label={`Remove ${line.label}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted">
          Invoice total for the quantities and prices entered above — check this against the paper invoice.
        </p>
        <OrderTotals
          lines={lines.map((line) => ({ quantity_ordered: line.quantity_received, unit_price: line.unit_cost }))}
          gstRegistered={gstRegistered}
          gstRate={gstRate}
          adjustment={roundingAdjustment}
          totalQuantity={combinedTotalQty}
          uniqueSkuCount={uniqueSkuCount}
        />
      </div>

      <button className={btnClass} disabled={pending} type="submit">
        {pending ? "Receiving…" : "Receive into stock"}
      </button>

      {pendingFormData ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-white p-4 shadow-lg">
            <h2 className="text-lg font-semibold">Confirm receipt</h2>
            <p className="mt-1 text-sm text-muted">
              This writes {receivingLines.length + receivingFreeLines.length} line
              {receivingLines.length + receivingFreeLines.length === 1 ? "" : "s"} to stock and cannot be edited
              afterward — only voided.
            </p>

            {skippedLines.length > 0 ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {skippedLines.length} line{skippedLines.length === 1 ? "" : "s"} still show 0 received and won&apos;t
                be recorded in this receipt: {skippedLines.map((line) => line.label).join(", ")}.
              </p>
            ) : null}

            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Product</th>
                    <th className={thClass}>Qty</th>
                    <th className={thClass}>Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingLines.map((line) => (
                    <tr key={line.purchase_order_item_id}>
                      <td className={tdClass}>{line.label}</td>
                      <td className={tdClass}>{formatQty(line.quantity_received)}</td>
                      <td className={tdClass}>{formatMoney(line.unit_cost)}</td>
                    </tr>
                  ))}
                  {receivingFreeLines.map((line) => (
                    <tr key={line.key}>
                      <td className={tdClass}>{line.label} (free)</td>
                      <td className={tdClass}>{formatQty(line.quantity_received)}</td>
                      <td className={tdClass}>$0.00</td>
                    </tr>
                  ))}
                  {receivingLines.length + receivingFreeLines.length === 0 ? (
                    <tr>
                      <td className={tdClass} colSpan={3}>
                        Nothing has a quantity above 0 yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3">
              <OrderTotals
                lines={lines.map((line) => ({ quantity_ordered: line.quantity_received, unit_price: line.unit_cost }))}
                gstRegistered={gstRegistered}
                gstRate={gstRate}
                adjustment={roundingAdjustment}
                totalQuantity={combinedTotalQty}
                uniqueSkuCount={uniqueSkuCount}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className={btnSecondaryClass} type="button" onClick={() => setPendingFormData(null)}>
                Go back
              </button>
              <button
                className={btnClass}
                type="button"
                disabled={receivingLines.length + receivingFreeLines.length === 0}
                onClick={() => void confirmReceive()}
              >
                Confirm &amp; receive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
