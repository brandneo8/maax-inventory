"use client";

import { useMemo, useState } from "react";
import { SalonChipField } from "@/components/salon-chip-field";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { parseSize } from "@/lib/product-size";
import { btnClass, btnSecondaryClass, fieldClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type BulkEditFieldKey =
  | "classification"
  | "branchIds"
  | "tagIds"
  | "brand"
  | "brandSub"
  | "size"
  | "supplierId"
  | "threshold";

export type BulkEditFields = {
  classification?: ProductClassification | "";
  branchIds?: string[];
  tagIds?: string[];
  brand?: string;
  brandSub?: string;
  size?: string;
  supplierId?: string;
  threshold?: string;
};

const FIELD_LABELS: Record<BulkEditFieldKey, string> = {
  classification: "Default type",
  branchIds: "Salons",
  tagIds: "Tag",
  brand: "Brand",
  brandSub: "Brand_sub",
  size: "Size",
  supplierId: "Supplier",
  threshold: "Threshold",
};

const DEFAULT_FIELDS: BulkEditFieldKey[] = ["classification", "branchIds", "tagIds"];
const ALL_FIELDS: BulkEditFieldKey[] = [
  "classification",
  "branchIds",
  "tagIds",
  "brand",
  "brandSub",
  "size",
  "supplierId",
  "threshold",
];

function brandSubListId(brand: string) {
  return `bulk-brand-sub-${brand.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function BulkEditModal({
  open,
  pending,
  selectedCount,
  tags,
  branches,
  suppliers,
  brandOptions,
  brandSubsByBrand,
  onClose,
  onApply,
}: {
  open: boolean;
  pending: boolean;
  selectedCount: number;
  tags: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  brandOptions: string[];
  brandSubsByBrand: Map<string, string[]>;
  onClose: () => void;
  onApply: (fields: BulkEditFields) => Promise<void>;
}) {
  const [fieldKeys, setFieldKeys] = useState<BulkEditFieldKey[]>(DEFAULT_FIELDS);
  const [addKey, setAddKey] = useState<BulkEditFieldKey | "">("");
  const [classification, setClassification] = useState<ProductClassification | "">("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [tagId, setTagId] = useState("");
  const [brand, setBrand] = useState("");
  const [brandSub, setBrandSub] = useState("");
  const [size, setSize] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unused = useMemo(
    () => ALL_FIELDS.filter((key) => !fieldKeys.includes(key)),
    [fieldKeys],
  );

  function reset() {
    setFieldKeys(DEFAULT_FIELDS);
    setAddKey("");
    setClassification("");
    setBranchIds([]);
    setTagId("");
    setBrand("");
    setBrandSub("");
    setSize("");
    setSupplierId("");
    setThreshold("");
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function addField() {
    if (!addKey || fieldKeys.includes(addKey)) return;
    setFieldKeys((current) => [...current, addKey]);
    setAddKey("");
  }

  function removeField(key: BulkEditFieldKey) {
    setFieldKeys((current) => current.filter((item) => item !== key));
  }

  async function apply() {
    if (fieldKeys.length === 0) {
      setError("Add at least one field to apply.");
      return;
    }
    if (fieldKeys.includes("size") && size.trim() && !parseSize(size)) {
      setError("Size must look like 175ml, 175 ml, 1L, or 175g.");
      return;
    }

    const fields: BulkEditFields = {};
    for (const key of fieldKeys) {
      if (key === "classification") fields.classification = classification;
      if (key === "branchIds") fields.branchIds = [...branchIds];
      if (key === "tagIds") fields.tagIds = tagId ? [tagId] : [];
      if (key === "brand") fields.brand = brand;
      if (key === "brandSub") fields.brandSub = brandSub;
      if (key === "size") fields.size = size;
      if (key === "supplierId") fields.supplierId = supplierId;
      if (key === "threshold") fields.threshold = threshold;
    }

    setError(null);
    try {
      await onApply(fields);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update products.");
    }
  }

  if (!open) return null;

  const brandSubNames = brandSubsByBrand.get(brand.trim()) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Bulk edit</h3>
            <p className="mt-1 text-sm text-muted">
              Apply to {selectedCount} product{selectedCount === 1 ? "" : "s"}. Empty values on listed
              fields are cleared. Fields not listed are left unchanged.
            </p>
          </div>
          <button className={btnSecondaryClass} type="button" disabled={pending} onClick={close}>
            Cancel
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {brand.trim() ? (
          <datalist id={brandSubListId(brand)}>
            {brandSubNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}

        <div className="mt-4 space-y-3">
          {fieldKeys.map((key) => (
            <div key={key} className="flex items-start gap-2">
              <label className="min-w-0 flex-1 space-y-1 text-sm">
                <span className="font-medium">{FIELD_LABELS[key]}</span>
                {key === "classification" ? (
                  <select
                    className={fieldClass}
                    value={classification}
                    onChange={(event) =>
                      setClassification(event.target.value as ProductClassification | "")
                    }
                    disabled={pending}
                  >
                    <option value="">None</option>
                    {CLASSIFICATIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                {key === "branchIds" ? (
                  <SalonChipField
                    branches={branches}
                    selectedIds={branchIds}
                    onChange={setBranchIds}
                    disabled={pending}
                    ariaLabel="Set salons for selected products"
                  />
                ) : null}
                {key === "tagIds" ? (
                  <select
                    className={fieldClass}
                    value={tagId}
                    onChange={(event) => setTagId(event.target.value)}
                    disabled={pending}
                  >
                    <option value="">None</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {key === "brand" ? (
                  <input
                    className={fieldClass}
                    value={brand}
                    list="bulk-brand-options"
                    onChange={(event) => setBrand(event.target.value)}
                    disabled={pending}
                  />
                ) : null}
                {key === "brandSub" ? (
                  <input
                    className={fieldClass}
                    value={brandSub}
                    list={brand.trim() ? brandSubListId(brand) : undefined}
                    onChange={(event) => setBrandSub(event.target.value)}
                    disabled={pending}
                  />
                ) : null}
                {key === "size" ? (
                  <input
                    className={fieldClass}
                    value={size}
                    placeholder="175ml"
                    onChange={(event) => setSize(event.target.value)}
                    disabled={pending}
                  />
                ) : null}
                {key === "supplierId" ? (
                  <select
                    className={fieldClass}
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                    disabled={pending}
                  >
                    <option value="">None</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {key === "threshold" ? (
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    disabled={pending}
                  />
                ) : null}
              </label>
              <button
                className="mt-7 text-sm text-muted underline"
                type="button"
                disabled={pending}
                onClick={() => removeField(key)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <datalist id="bulk-brand-options">
          {brandOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {unused.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="min-w-48 flex-1 space-y-1 text-sm">
              <span className="text-muted">Add field</span>
              <select
                className={fieldClass}
                value={addKey}
                onChange={(event) => setAddKey(event.target.value as BulkEditFieldKey | "")}
                disabled={pending}
              >
                <option value="">Choose a field</option>
                {unused.map((key) => (
                  <option key={key} value={key}>
                    {FIELD_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={btnSecondaryClass}
              type="button"
              disabled={pending || !addKey}
              onClick={addField}
            >
              Add field
            </button>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className={btnSecondaryClass} type="button" disabled={pending} onClick={close}>
            Cancel
          </button>
          <button
            className={cn(btnClass)}
            type="button"
            disabled={pending || selectedCount === 0 || fieldKeys.length === 0}
            onClick={() => void apply()}
          >
            {pending ? "Applying…" : `Apply to ${selectedCount} product${selectedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
