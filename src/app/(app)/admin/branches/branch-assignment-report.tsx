"use client";

import { Fragment, useMemo, useState } from "react";
import { CLASSIFICATIONS, type ProductClassification } from "@/lib/labels";
import { btnSecondaryClass, checkboxClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { ChipField, type ChipOption } from "@/components/chip-field";
import {
  addProductsToBranch,
  bulkAddClassificationToBranch,
  bulkAddTagToProducts,
  createTag,
  removeProductFromBranch,
  updateProductClassificationForBranch,
  updateProductTags,
} from "./actions";

export type BranchReportProduct = {
  id: string;
  sku: string | null;
  label: string;
  brand: string;
  brandSub: string;
  sizeLabel: string | null;
  classificationsByBranch: Record<string, ProductClassification[]>;
  tagIds: string[];
  branchIds: string[];
};

export type PendingBranchRequest = {
  productId: string;
  branchId: string;
  poNumber: string;
  status: string;
};

type BranchOption = { id: string; name: string };

const PENDING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partially received",
};

const TYPE_CHIP_OPTIONS: ChipOption[] = CLASSIFICATIONS.filter((item) => item.value !== "retail_inhouse").map(
  (item) => ({ id: item.value, label: item.label }),
);

const COL_SELECT = "w-[4%]";
const COL_SKU = "w-[9%]";
const COL_PRODUCT = "w-[20%]";
const COL_SIZE = "w-[7%]";
const COL_TYPE = "w-[25%]";
const COL_TAGS = "w-[23%]";
const COL_ASSIGNED = "w-[12%]";

function AssignToggle({
  productId,
  branchId,
  assigned,
  onChanged,
}: {
  productId: string;
  branchId: string;
  assigned: boolean;
  onChanged: (productId: string, assigned: boolean) => void;
}) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      if (assigned) {
        await removeProductFromBranch(productId, branchId);
      } else {
        await addProductsToBranch([productId], branchId);
      }
      onChanged(productId, !assigned);
    } finally {
      setPending(false);
    }
  }

  return (
    <input
      type="checkbox"
      className={checkboxClass}
      checked={assigned}
      disabled={pending}
      onChange={() => void toggle()}
      aria-label={assigned ? "Assigned — click to remove" : "Not assigned — click to add"}
    />
  );
}

function TypeEditCell({
  productId,
  branchId,
  classifications,
  onSaved,
}: {
  productId: string;
  branchId: string;
  classifications: ProductClassification[];
  onSaved: (next: ProductClassification[]) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    const typed = next as ProductClassification[];
    setPending(true);
    setError(null);
    try {
      await updateProductClassificationForBranch(productId, branchId, typed);
      onSaved(typed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <ChipField
        options={TYPE_CHIP_OPTIONS}
        selectedIds={classifications}
        onChange={(ids) => void save(ids)}
        disabled={pending}
        compact
        placeholder="Add type…"
        ariaLabel="Type"
      />
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}

function TagEditCell({
  productId,
  tagOptions,
  selectedIds,
  onSaved,
  onTagCreated,
}: {
  productId: string;
  tagOptions: ChipOption[];
  selectedIds: string[];
  onSaved: (next: string[]) => void;
  onTagCreated: (tag: ChipOption) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    setPending(true);
    setError(null);
    try {
      await updateProductTags(productId, next);
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  async function create(label: string) {
    const tag = await createTag(label);
    onTagCreated(tag);
    return tag;
  }

  return (
    <div className="space-y-1">
      <ChipField
        options={tagOptions}
        selectedIds={selectedIds}
        onChange={(ids) => void save(ids)}
        onCreate={create}
        disabled={pending}
        compact
        placeholder="Add tag…"
        ariaLabel="Tags"
      />
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}

function BulkActionsBar({
  selectedCount,
  tagOptions,
  branchName,
  allAssigned,
  onAssign,
  onApplyType,
  onApplyTag,
  onCreateTag,
  onClear,
}: {
  selectedCount: number;
  tagOptions: ChipOption[];
  branchName: string;
  allAssigned: boolean;
  onAssign: () => Promise<void>;
  onApplyType: (classification: ProductClassification) => Promise<void>;
  onApplyTag: (tagId: string) => Promise<void>;
  onCreateTag: (label: string) => Promise<ChipOption>;
  onClear: () => void;
}) {
  const [pendingType, setPendingType] = useState<ProductClassification | "">("");
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);

  async function assign() {
    setAssigning(true);
    try {
      await onAssign();
    } finally {
      setAssigning(false);
    }
  }

  async function applyType() {
    if (!pendingType) return;
    setBusy(true);
    try {
      await onApplyType(pendingType);
      setPendingType("");
    } finally {
      setBusy(false);
    }
  }

  async function applyTag() {
    const tagId = pendingTagIds[0];
    if (!tagId) return;
    setBusy(true);
    try {
      await onApplyTag(tagId);
      setPendingTagIds([]);
    } finally {
      setBusy(false);
    }
  }

  async function createAndSelect(label: string) {
    const tag = await onCreateTag(label);
    setPendingTagIds([tag.id]);
    return tag;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-slate-50 px-3 py-2 text-sm">
      <span className="font-medium">{selectedCount} selected</span>

      {!allAssigned ? (
        <button
          type="button"
          className={btnSecondaryClass}
          disabled={assigning}
          onClick={() => void assign()}
        >
          {assigning ? "Assigning…" : `Assign to ${branchName}`}
        </button>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Add type to {branchName}:</span>
        <select
          className="rounded-md border border-border bg-white px-1.5 py-1 text-xs"
          value={pendingType}
          disabled={busy}
          onChange={(event) => setPendingType(event.target.value as ProductClassification | "")}
        >
          <option value="">Choose…</option>
          {TYPE_CHIP_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btnSecondaryClass}
          disabled={busy || !pendingType}
          onClick={() => void applyType()}
        >
          Apply
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Add tag:</span>
        <div className="w-48">
          <ChipField
            options={tagOptions}
            selectedIds={pendingTagIds}
            onChange={(ids) => setPendingTagIds(ids.slice(-1))}
            onCreate={createAndSelect}
            disabled={busy}
            compact
            placeholder="Choose tag…"
            ariaLabel="Bulk tag"
          />
        </div>
        <button
          type="button"
          className={btnSecondaryClass}
          disabled={busy || pendingTagIds.length === 0}
          onClick={() => void applyTag()}
        >
          Apply
        </button>
      </div>

      <button type="button" className="ml-auto text-xs text-muted underline" onClick={onClear} disabled={busy}>
        Clear selection
      </button>
    </div>
  );
}

export function BranchAssignmentReport({
  branches,
  tags: initialTags,
  products: initialProducts,
  pendingRequests,
}: {
  branches: BranchOption[];
  tags: ChipOption[];
  products: BranchReportProduct[];
  pendingRequests: PendingBranchRequest[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [tags, setTags] = useState(initialTags);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");

  const pendingByProduct = useMemo(() => {
    const map = new Map<string, PendingBranchRequest[]>();
    for (const request of pendingRequests) {
      if (request.branchId !== branchId) continue;
      const list = map.get(request.productId) ?? [];
      list.push(request);
      map.set(request.productId, list);
    }
    return map;
  }, [pendingRequests, branchId]);
  const [assignedByBranch, setAssignedByBranch] = useState<Record<string, Set<string>>>(() => {
    const map: Record<string, Set<string>> = {};
    for (const branch of branches) {
      map[branch.id] = new Set(
        initialProducts.filter((product) => product.branchIds.includes(branch.id)).map((p) => p.id),
      );
    }
    return map;
  });
  const [selectedBySeries, setSelectedBySeries] = useState<Record<string, Set<string>>>({});
  const [collapsedSeries, setCollapsedSeries] = useState<Record<string, boolean>>({});

  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";
  const assignedSet = useMemo(() => assignedByBranch[branchId] ?? new Set<string>(), [assignedByBranch, branchId]);

  function markAssigned(productId: string, assigned: boolean) {
    setAssignedByBranch((current) => {
      const next = { ...current };
      const set = new Set(next[branchId] ?? []);
      if (assigned) set.add(productId);
      else set.delete(productId);
      next[branchId] = set;
      return next;
    });
  }

  function updateProductClassificationLocal(productId: string, next: ProductClassification[]) {
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? { ...product, classificationsByBranch: { ...product.classificationsByBranch, [branchId]: next } }
          : product,
      ),
    );
  }

  function updateProductTagsLocal(productId: string, next: string[]) {
    setProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, tagIds: next } : product)),
    );
  }

  function addTagOption(tag: ChipOption) {
    setTags((current) => (current.some((item) => item.id === tag.id) ? current : [...current, tag]));
  }

  function toggleSelected(seriesId: string, productId: string) {
    setSelectedBySeries((current) => {
      const set = new Set(current[seriesId] ?? []);
      if (set.has(productId)) set.delete(productId);
      else set.add(productId);
      return { ...current, [seriesId]: set };
    });
  }

  function toggleSelectAll(seriesId: string, ids: string[], checked: boolean) {
    setSelectedBySeries((current) => ({ ...current, [seriesId]: checked ? new Set(ids) : new Set() }));
  }

  function clearSelected(seriesId: string) {
    setSelectedBySeries((current) => ({ ...current, [seriesId]: new Set() }));
  }

  function toggleCollapsed(seriesId: string) {
    setCollapsedSeries((current) => ({ ...current, [seriesId]: !current[seriesId] }));
  }

  const brandProducts = useMemo(() => {
    const map = new Map<string, BranchReportProduct[]>();
    for (const product of products) {
      const brandKey = product.brand.trim() || "No brand";
      const list = map.get(brandKey) ?? [];
      list.push(product);
      map.set(brandKey, list);
    }
    return map;
  }, [products]);

  const brandList = useMemo(() => {
    return [...brandProducts.entries()]
      .map(([brand, brandItems]) => ({
        brand,
        active: brandItems.some((product) => assignedSet.has(product.id)),
      }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [brandProducts, assignedSet]);

  const activeBrands = brandList.filter((item) => item.active);
  const inactiveBrands = brandList.filter((item) => !item.active);

  const [selectedBrand, setSelectedBrand] = useState<string>(() => {
    const defaultBranchId = branches[0]?.id ?? "";
    const assignedDefault = new Set(
      initialProducts.filter((product) => product.branchIds.includes(defaultBranchId)).map((product) => product.id),
    );
    const byBrand = new Map<string, BranchReportProduct[]>();
    for (const product of initialProducts) {
      const brandKey = product.brand.trim() || "No brand";
      const list = byBrand.get(brandKey) ?? [];
      list.push(product);
      byBrand.set(brandKey, list);
    }
    const sortedBrands = [...byBrand.keys()].sort((a, b) => a.localeCompare(b));
    const firstActive = sortedBrands.find((brand) =>
      (byBrand.get(brand) ?? []).some((product) => assignedDefault.has(product.id)),
    );
    return firstActive ?? sortedBrands[0] ?? "";
  });

  const selectedSeries = useMemo(() => {
    const list = brandProducts.get(selectedBrand) ?? [];
    const bySeries = new Map<string, BranchReportProduct[]>();
    for (const product of list) {
      const seriesKey = product.brandSub.trim() || "No series";
      const arr = bySeries.get(seriesKey) ?? [];
      arr.push(product);
      bySeries.set(seriesKey, arr);
    }
    return [...bySeries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [brandProducts, selectedBrand]);

  const [assignedOnly, setAssignedOnly] = useState(false);

  const visibleSeries = useMemo(() => {
    return selectedSeries
      .map(([seriesKey, seriesProducts]) => ({
        seriesKey,
        seriesProducts,
        filteredProducts: seriesProducts.filter((product) => !assignedOnly || assignedSet.has(product.id)),
      }))
      .filter((group) => group.filteredProducts.length > 0);
  }, [selectedSeries, assignedOnly, assignedSet]);

  async function bulkAssign(productIds: string[]) {
    const toAdd = productIds.filter((id) => !assignedSet.has(id));
    if (toAdd.length === 0) return;
    await addProductsToBranch(toAdd, branchId);
    for (const id of toAdd) markAssigned(id, true);
  }

  async function bulkApplyType(seriesId: string, productIds: string[], classification: ProductClassification) {
    await bulkAddClassificationToBranch(productIds, branchId, classification);
    for (const productId of productIds) {
      const current = products.find((product) => product.id === productId)?.classificationsByBranch[branchId] ?? [];
      if (!current.includes(classification)) {
        updateProductClassificationLocal(productId, [...current, classification]);
      }
    }
  }

  async function bulkApplyTag(seriesId: string, productIds: string[], tagId: string) {
    await bulkAddTagToProducts(productIds, tagId);
    for (const productId of productIds) {
      const current = products.find((product) => product.id === productId)?.tagIds ?? [];
      if (!current.includes(tagId)) {
        updateProductTagsLocal(productId, [...current, tagId]);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => setBranchId(branch.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              branch.id === branchId ? "bg-slate-900 font-medium text-white" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {branch.name}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Active at {branchName}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeBrands.length === 0 ? <span className="text-xs text-muted">No brands yet.</span> : null}
            {activeBrands.map(({ brand }) => (
              <button
                key={brand}
                type="button"
                onClick={() => setSelectedBrand(brand)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  brand === selectedBrand
                    ? "bg-slate-900 text-white"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                )}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Inactive at {branchName}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {inactiveBrands.length === 0 ? <span className="text-xs text-muted">None.</span> : null}
            {inactiveBrands.map(({ brand }) => (
              <button
                key={brand}
                type="button"
                onClick={() => setSelectedBrand(brand)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  brand === selectedBrand ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {brand}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h3 className="border-b border-border p-3 text-base font-semibold">{selectedBrand || "Select a brand"}</h3>
        <div className="overflow-x-auto">
          <table className={cn(tableClass, "table-fixed")}>
            <thead>
              <tr>
                <th className={cn(thClass, COL_SELECT)} />
                <th className={cn(thClass, COL_SKU)}>SKU</th>
                <th className={cn(thClass, COL_PRODUCT)}>Product</th>
                <th className={cn(thClass, COL_SIZE)}>Size</th>
                <th className={cn(thClass, COL_TYPE)}>Type</th>
                <th className={cn(thClass, COL_TAGS)}>Tags</th>
                <th className={cn(thClass, COL_ASSIGNED)}>
                  <label className="flex items-center gap-1.5 font-normal normal-case">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={assignedOnly}
                      onChange={(event) => setAssignedOnly(event.target.checked)}
                      aria-label="Show assigned only"
                    />
                    <span>Assigned</span>
                  </label>
                </th>
              </tr>
            </thead>
            <tbody>
              {selectedSeries.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={7}>
                    No products in this brand.
                  </td>
                </tr>
              ) : visibleSeries.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={7}>
                    No SKUs match this filter.
                  </td>
                </tr>
              ) : (
                visibleSeries.map(({ seriesKey, seriesProducts, filteredProducts }) => {
                  const seriesId = `${selectedBrand}::${seriesKey}`;
                  const assignedCount = seriesProducts.filter((product) => assignedSet.has(product.id)).length;
                    const seriesIds = filteredProducts.map((product) => product.id);
                    const selected = selectedBySeries[seriesId] ?? new Set<string>();
                    const allSelected = selected.size > 0 && seriesIds.every((id) => selected.has(id));
                    const collapsed = collapsedSeries[seriesId] ?? false;

                    return (
                      <Fragment key={seriesId}>
                        <tr className="bg-slate-50">
                          <td className={tdClass}>
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              checked={allSelected}
                              onChange={(event) => toggleSelectAll(seriesId, seriesIds, event.target.checked)}
                              aria-label={`Select all rows in ${seriesKey}`}
                            />
                          </td>
                          <td className={tdClass} colSpan={6}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <button
                                type="button"
                                className="flex items-center gap-2 text-left"
                                onClick={() => toggleCollapsed(seriesId)}
                                aria-expanded={!collapsed}
                              >
                                <span
                                  className={cn(
                                    "inline-block text-xs text-muted transition-transform",
                                    collapsed ? "-rotate-90" : "rotate-0",
                                  )}
                                  aria-hidden
                                >
                                  ▼
                                </span>
                                <span>
                                  <span className="text-sm font-semibold">{seriesKey}</span>
                                  <span className="ml-2 text-xs text-muted">
                                    {assignedCount} / {seriesProducts.length} SKUs assigned to {branchName}
                                  </span>
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {selected.size > 0 ? (
                          <tr>
                            <td className={cn(tdClass, "p-0")} colSpan={7}>
                              <BulkActionsBar
                                selectedCount={selected.size}
                                tagOptions={tags}
                                branchName={branchName}
                                allAssigned={[...selected].every((id) => assignedSet.has(id))}
                                onAssign={() => bulkAssign([...selected])}
                                onApplyType={(classification) => bulkApplyType(seriesId, [...selected], classification)}
                                onApplyTag={(tagId) => bulkApplyTag(seriesId, [...selected], tagId)}
                                onCreateTag={async (label) => {
                                  const tag = await createTag(label);
                                  addTagOption(tag);
                                  return tag;
                                }}
                                onClear={() => clearSelected(seriesId)}
                              />
                            </td>
                          </tr>
                        ) : null}
                        {!collapsed
                          ? filteredProducts.map((product) => {
                              const assigned = assignedSet.has(product.id);
                              const types = product.classificationsByBranch[branchId] ?? [];
                              return (
                                <tr key={product.id}>
                                  <td className={tdClass}>
                                    <input
                                      type="checkbox"
                                      className={checkboxClass}
                                      checked={selected.has(product.id)}
                                      onChange={() => toggleSelected(seriesId, product.id)}
                                      aria-label={`Select ${product.label}`}
                                    />
                                  </td>
                                  <td className={tdClass}>{product.sku || "—"}</td>
                                  <td className={tdClass}>{product.label}</td>
                                  <td className={tdClass}>{product.sizeLabel || "—"}</td>
                                  <td className={tdClass}>
                                    <TypeEditCell
                                      productId={product.id}
                                      branchId={branchId}
                                      classifications={types}
                                      onSaved={(next) => updateProductClassificationLocal(product.id, next)}
                                    />
                                  </td>
                                  <td className={tdClass}>
                                    <TagEditCell
                                      productId={product.id}
                                      tagOptions={tags}
                                      selectedIds={product.tagIds}
                                      onSaved={(next) => updateProductTagsLocal(product.id, next)}
                                      onTagCreated={addTagOption}
                                    />
                                  </td>
                                  <td className={tdClass}>
                                    <div className="flex items-center gap-1.5">
                                      <AssignToggle
                                        productId={product.id}
                                        branchId={branchId}
                                        assigned={assigned}
                                        onChanged={markAssigned}
                                      />
                                      {!assigned && pendingByProduct.has(product.id) ? (
                                        <span
                                          className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                          title={pendingByProduct
                                            .get(product.id)!
                                            .map(
                                              (request) =>
                                                `${request.poNumber} (${PENDING_STATUS_LABEL[request.status] ?? request.status})`,
                                            )
                                            .join(", ")}
                                        >
                                          Requested — {pendingByProduct.get(product.id)![0]!.poNumber}
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          : null}
                      </Fragment>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
