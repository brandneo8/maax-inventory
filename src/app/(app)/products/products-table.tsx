"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  deleteProduct,
  saveProducts,
  type ProductDraft,
} from "./actions";
import { catalogTax, confirmedRetailPrice, grossMarginPercent, allocatedBundleTotal, autoAllocateBundleCosts, bundleCostRemainder, bundleCostsComplete, inheritedUnitCost, roundMoney } from "@/lib/catalog-pricing";
import { downloadCsv } from "@/lib/csv";
import { formatCatalogSavedLabel, formatMoney, formatPercent, formatQty, productDisplayName, productLabel } from "@/lib/format";
import { searchFieldsMatch, searchTextMatches } from "@/lib/search";
import { SalonChipField } from "@/components/salon-chip-field";
import { BrandSubFilter, NO_BRAND_SUB } from "@/components/brand-sub-filter";
import { CLASSIFICATIONS, classificationLabel, salonChipLabel, type ProductClassification } from "@/lib/labels";
import { parseSize, sizesMatch } from "@/lib/product-size";
import { btnClass, btnSecondaryClass, checkboxClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { BulkEditModal, type BulkEditFields } from "./bulk-edit-modal";

export type BundleDraft = { productId: string; quantity: number; label: string; allocatedCost: string };

export type ProductRow = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  orderName: string;
  brand: string;
  brandSub: string;
  defaultClassification: ProductClassification | null;
  unitCost: number;
  rrp: number | null;
  threshold: number | null;
  tagIds: string[];
  tagNames: string[];
  sizeLabel: string | null;
  sizeMl: number | null;
  isSet: boolean;
  branchIds: string[];
  supplierIds: string[];
  supplierName: string;
  gstRegistered: boolean;
  components: { productId: string; quantity: number; label: string; allocatedCost: number | null }[];
};

type TableDraft = ProductDraft & {
  tagNames: string[];
  sizeMl: number | null;
  supplierName: string;
  gstRegistered: boolean;
  componentLabels: BundleDraft[];
};

const SELECT_COL_REM = 9;
const SALON_TAGS_REM = 11;
const wCheck = "w-36 min-w-36";
const wSalons = "w-44 min-w-44";
const wField = "min-w-28";
const wName = "w-72 min-w-72";
const wFriendly = "min-w-44";
const wType = "min-w-44";
const wSupplier = "min-w-52";
const wContents = "min-w-56";
const stickyHead = "sticky top-0 z-20 bg-card";
const stickyCheck = "sticky left-0 z-10";
const stickySalons = "sticky z-10";
const stickyName = "sticky z-10 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)]";
const stickyCheckHead = "sticky top-0 left-0 z-30 bg-card";
const stickySalonsHead = "sticky top-0 z-30 bg-card";
const stickyNameHead = "sticky top-0 z-30 bg-card shadow-[2px_0_4px_-2px_rgba(15,23,42,0.15)]";

function moneyInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return String(value);
}

function toDraft(product: ProductRow): TableDraft {
  return {
    id: product.id,
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    name: product.name ?? "",
    orderName: product.orderName,
    brand: product.brand,
    brandSub: product.brandSub,
    size: product.sizeLabel ?? "",
    classification: product.defaultClassification ?? "",
    unitCost: moneyInput(product.unitCost),
    rrp: moneyInput(product.rrp),
    threshold: moneyInput(product.threshold),
    isSet: product.isSet,
    tagIds: product.tagIds,
    tagNames: product.tagNames,
    sizeMl: product.sizeMl,
    branchIds: product.branchIds,
    components: product.components.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      allocatedCost: item.allocatedCost,
    })),
    componentLabels: product.components.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      label: item.label,
      allocatedCost:
        item.allocatedCost == null
          ? product.components.length === 1
            ? moneyInput(product.unitCost)
            : ""
          : moneyInput(item.allocatedCost),
    })),
    supplierIds: product.supplierIds,
    supplierName: product.supplierName,
    gstRegistered: product.gstRegistered,
  };
}

const PAGE_SIZES = [50, 100, 500, 1000] as const;

const UNGROUPED = "Ungrouped";

type GroupBy = "none" | "brandSub" | "brand" | "salon" | "tags" | "type" | "supplier";

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "brandSub", label: "Brand_sub" },
  { value: "brand", label: "Brand" },
  { value: "salon", label: "Salon" },
  { value: "tags", label: "Tags" },
  { value: "type", label: "Type" },
  { value: "supplier", label: "Suppliers" },
];

function salonGroupLabel(row: TableDraft, branches: { id: string; name: string }[]) {
  const labels = row.branchIds
    .map((id) => {
      const branch = branches.find((item) => item.id === id);
      return branch ? salonChipLabel(branch.name) : "";
    })
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  return labels.join(", ") || "No salon";
}

function rowGroupKey(
  row: TableDraft,
  groupBy: GroupBy,
  branches: { id: string; name: string }[],
) {
  if (groupBy === "none") return UNGROUPED;
  if (groupBy === "brandSub") return row.brandSub.trim() || UNGROUPED;
  if (groupBy === "brand") return row.brand.trim() || UNGROUPED;
  if (groupBy === "salon") return salonGroupLabel(row, branches);
  if (groupBy === "tags") {
    const names = row.tagNames
      .map((name) => name.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
    return names.length > 0 ? names.join(", ") : "No tag";
  }
  if (groupBy === "type") return row.classification ? classificationLabel(row.classification) : "No type";
  const supplier = row.supplierName.trim();
  return supplier || "No supplier";
}

function groupSortPrefix(key: string) {
  if (key === UNGROUPED || key.startsWith("No ")) return `0:${key}`;
  return `1:${key}`;
}

function brandSubListId(brand: string) {
  return `brand-sub-${brand.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function productFingerprint(row: { orderName: string; sku: string; barcode: string }) {
  return `${row.orderName.trim().toLowerCase()}|${row.sku.trim().toLowerCase()}|${row.barcode.trim().toLowerCase()}`;
}

function parsedAllocatedCost(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

function contentsPayload(contents: BundleDraft[]) {
  return contents.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    allocatedCost: parsedAllocatedCost(item.allocatedCost),
  }));
}

function inheritChildCosts(rows: TableDraft[], contents: BundleDraft[], dirtyIds: Set<string>) {
  const nextCosts = new Map<string, string>();
  for (const item of contents) {
    const allocated = parsedAllocatedCost(item.allocatedCost);
    const quantity = Number(item.quantity);
    if (!item.productId || allocated == null || !(quantity > 0)) continue;
    nextCosts.set(item.productId, moneyInput(inheritedUnitCost(allocated, quantity)));
  }
  return rows.map((row) => {
    if (!row.id) return row;
    const unitCost = nextCosts.get(row.id);
    if (unitCost == null || row.unitCost === unitCost) return row;
    dirtyIds.add(row.id);
    return { ...row, unitCost };
  });
}

function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function ViewValue({ children }: { children: ReactNode }) {
  return <span className="block text-sm">{children}</span>;
}

function withParentContents(row: TableDraft, contents: BundleDraft[]): TableDraft {
  const allocated = autoAllocateBundleCosts(Number(row.unitCost) || 0, contents);
  return {
    ...row,
    components: contentsPayload(allocated),
    componentLabels: allocated,
  };
}

function emptyRow(branchIds: string[]): TableDraft {
  return {
    clientKey: crypto.randomUUID(),
    sku: "",
    barcode: "",
    name: "",
    orderName: "",
    brand: "",
    brandSub: "",
    size: "",
    classification: "",
    unitCost: "0",
    rrp: "",
    threshold: "",
    isSet: false,
    tagIds: [],
    tagNames: [],
    sizeMl: null,
    branchIds,
    components: [],
    componentLabels: [],
    supplierIds: [],
    supplierName: "",
    gstRegistered: false,
  };
}

function csvNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return roundMoney(Number(value));
}

function csvContents(contents: BundleDraft[]) {
  return contents
    .map((item) => {
      const quantity = Number(item.quantity);
      if (Number.isFinite(quantity) && quantity > 0 && quantity !== 1) {
        return `${item.label} · ${formatQty(quantity)}×`;
      }
      return item.label;
    })
    .join("; ");
}

function catalogCsvRow(
  row: TableDraft,
  options: {
    branches: { id: string; name: string }[];
    suppliers: { id: string; name: string; gstRegistered: boolean }[];
    gstBySupplier: Map<string, boolean>;
    gstRate: number;
    usedInBundles: Map<string, string[]>;
  },
) {
  const gstRegistered =
    row.supplierIds.length > 0
      ? row.supplierIds.some((id) => options.gstBySupplier.get(id))
      : row.gstRegistered;
  const unitCost = Number(row.unitCost) || 0;
  const rrp = row.rrp === "" ? null : Number(row.rrp);
  const pricing = catalogTax(unitCost, gstRegistered, options.gstRate);
  const crp = confirmedRetailPrice(unitCost, rrp);
  const supplier =
    options.suppliers.find((item) => item.id === row.supplierIds[0])?.name ?? row.supplierName;
  return {
    Salons: options.branches
      .filter((branch) => row.branchIds.includes(branch.id))
      .map((branch) => salonChipLabel(branch.name))
      .join(", "),
    "Order name": row.orderName,
    Name: row.name,
    SKU: row.sku,
    Barcode: row.barcode,
    Brand: row.brand,
    Brand_sub: row.brandSub,
    Size: row.size,
    Type: row.classification ? classificationLabel(row.classification) : "",
    Tags: row.tagNames.filter(Boolean).join(", "),
    Supplier: supplier,
    "Unit cost": csvNumber(unitCost),
    "Tax amount": csvNumber(pricing.taxAmount),
    "Unit cost with tax": csvNumber(pricing.unitCostWithTax),
    RRP: row.rrp === "" ? "" : csvNumber(rrp),
    CRP: csvNumber(crp),
    "Gross margin": csvNumber(grossMarginPercent(crp, unitCost)),
    "Gross margin 2": csvNumber(grossMarginPercent(crp, pricing.unitCostWithTax)),
    Threshold: row.threshold === "" ? "" : csvNumber(Number(row.threshold)),
    Bundle: row.isSet ? "Yes" : "No",
    Contents: csvContents(row.componentLabels),
    "In bundle": row.id ? (options.usedInBundles.get(row.id) ?? []).join("; ") : "",
  };
}

function rowHasCatalogExport(row: TableDraft) {
  return Boolean(row.id || row.orderName.trim() || row.name.trim() || row.sku.trim());
}

const bulkOverrides = new Map<string, Partial<TableDraft>>();

function sameIdList(left: string[] = [], right: string[] = []) {
  if (left.length !== right.length) return false;
  const extra = new Set(right);
  return left.every((id) => extra.delete(id)) && extra.size === 0;
}

function overrideCaughtUp(product: ProductRow, override: Partial<TableDraft>) {
  if (override.classification != null && (product.defaultClassification ?? "") !== override.classification) {
    return false;
  }
  if (override.tagIds && !sameIdList(product.tagIds, override.tagIds)) return false;
  if (override.branchIds && !sameIdList(product.branchIds, override.branchIds)) return false;
  if (override.brand != null && product.brand !== override.brand) return false;
  if (override.brandSub != null && product.brandSub !== override.brandSub) return false;
  if (override.size != null && (product.sizeLabel ?? "") !== override.size) return false;
  if (override.supplierIds && !sameIdList(product.supplierIds, override.supplierIds)) return false;
  if (override.threshold != null && moneyInput(product.threshold) !== override.threshold) return false;
  return true;
}

function withBulkOverride(row: TableDraft): TableDraft {
  if (!row.id) return row;
  const override = bulkOverrides.get(row.id);
  return override ? { ...row, ...override } : row;
}

function pruneCaughtUpOverrides(nextProducts: ProductRow[]) {
  for (const product of nextProducts) {
    const override = bulkOverrides.get(product.id);
    if (override && overrideCaughtUp(product, override)) bulkOverrides.delete(product.id);
  }
}

async function postCatalogBundle(payload: {
  productId: string;
  unitCost: number;
  components: { productId: string; quantity: number; allocatedCost: number | null }[];
  replaceEmpty?: boolean;
}) {
  const response = await fetch("/admin/catalog-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error || "Could not save bundle contents.");
  }
}

async function postCatalogBulk(payload: { productIds: string[]; fields: BulkEditFields }) {
  const response = await fetch("/admin/catalog-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "edit", ...payload }),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error || "Could not update products.");
  }
}

function bulkFieldsToPatch(
  fields: BulkEditFields,
  tags: { id: string; name: string }[],
  suppliers: { id: string; name: string; gstRegistered: boolean }[],
): Partial<TableDraft> {
  const patch: Partial<TableDraft> = {};
  if (fields.classification !== undefined) patch.classification = fields.classification;
  if (fields.branchIds !== undefined) patch.branchIds = fields.branchIds;
  if (fields.tagIds !== undefined) {
    const tag = tags.find((item) => item.id === fields.tagIds?.[0]);
    patch.tagIds = tag ? [tag.id] : [];
    patch.tagNames = tag ? [tag.name] : [];
  }
  if (fields.brand !== undefined) patch.brand = fields.brand.trim();
  if (fields.brandSub !== undefined) patch.brandSub = fields.brandSub.trim();
  if (fields.size !== undefined) {
    const raw = fields.size.trim();
    if (!raw) {
      patch.size = "";
      patch.sizeMl = null;
    } else {
      const parsed = parseSize(raw);
      patch.size = parsed?.label ?? raw;
      patch.sizeMl = parsed?.ml ?? null;
    }
  }
  if (fields.supplierId !== undefined) {
    const supplier = suppliers.find((item) => item.id === fields.supplierId);
    patch.supplierIds = supplier ? [supplier.id] : [];
    patch.supplierName = supplier?.name ?? "";
    patch.gstRegistered = supplier?.gstRegistered ?? false;
  }
  if (fields.threshold !== undefined) patch.threshold = fields.threshold.trim();
  return patch;
}

export function ProductsTable({
  products,
  tags,
  branches,
  suppliers,
  gstRate = 9,
  catalogSavedAt = null,
  catalogSavedByEmail = null,
}: {
  products: ProductRow[];
  tags: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  suppliers: { id: string; name: string; gstRegistered: boolean }[];
  gstRate?: number;
  catalogSavedAt?: string | null;
  catalogSavedByEmail?: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    products.length > 0 ? products.map((product) => withBulkOverride(toDraft(product))) : [],
  );
  const [editing, setEditing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState(() => new Date());
  const [overlayTick, setOverlayTick] = useState(0);
  const [recentBulkIds, setRecentBulkIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [brandSubFilter, setBrandSubFilter] = useState<string[]>([]);
  const [customBrandSubs, setCustomBrandSubs] = useState<{ brand: string; name: string }[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("brandSub");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [salonFilter, setSalonFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [dirty, setDirty] = useState<Set<number>>(() => new Set());
  const [bundleIndex, setBundleIndex] = useState<number | null>(null);
  const [bundleQuery, setBundleQuery] = useState("");
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [headHeight, setHeadHeight] = useState(41);
  const skipProductSync = useRef(false);
  const dirtyIdsRef = useRef(new Set<string>());
  const editingRef = useRef(editing);
  const dirtyRef = useRef(dirty);
  editingRef.current = editing;
  dirtyRef.current = dirty;

  useEffect(() => {
    pruneCaughtUpOverrides(products);
    if (skipProductSync.current) {
      skipProductSync.current = false;
      return;
    }
    setRows((current) => {
      if (!editing) {
        dirtyIdsRef.current.clear();
        setDirty(new Set());
        return products.map((product) => withBulkOverride(toDraft(product)));
      }
      const currentById = new Map(
        current.filter((row) => row.id).map((row) => [row.id as string, row]),
      );
      const saved = products.map((product) => {
        const local = currentById.get(product.id);
        const incoming = toDraft(product);
        const base = local && dirtyIdsRef.current.has(product.id) ? local : incoming;
        return withBulkOverride(base);
      });
      const savedKeys = new Set(saved.map(productFingerprint));
      const drafts = current.filter((row) => {
        if (row.id) return false;
        if (!row.orderName.trim() && !row.name.trim()) return true;
        return !savedKeys.has(productFingerprint(row));
      });
      if (drafts.length === 0 && saved.length === 0) {
        return [emptyRow(branches.map((branch) => branch.id))];
      }
      const next = [...drafts, ...saved];
      setDirty(new Set(next.flatMap((row, index) => (row.id && dirtyIdsRef.current.has(row.id) ? [index] : []))));
      return next;
    });
  }, [branches, editing, products]);

  useEffect(() => {
    if (recentBulkIds.size === 0) return;
    const timer = window.setTimeout(() => setRecentBulkIds(new Set()), 2400);
    return () => window.clearTimeout(timer);
  }, [recentBulkIds]);

  useEffect(() => {
    function canReload() {
      return !(editingRef.current && (dirtyIdsRef.current.size > 0 || dirtyRef.current.size > 0));
    }
    function reloadIfSafe() {
      if (!canReload()) return;
      setSnapshotAt(new Date());
      router.refresh();
    }
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      reloadIfSafe();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", reloadIfSafe);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", reloadIfSafe);
    };
  }, [router]);

  const brandOptions = useMemo(
    () => [...new Set(rows.map((row) => row.brand.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [rows],
  );

  const rowMatchesFilters = useCallback(
    (row: TableDraft, ignoreBrandSub = false) => {
      const current = withBulkOverride(row);
      if (brandFilter && current.brand.trim() !== brandFilter) return false;
      if (!ignoreBrandSub && brandSubFilter.length > 0) {
        const wantsNone = brandSubFilter.includes(NO_BRAND_SUB);
        const wanted = brandSubFilter.filter((name) => name !== NO_BRAND_SUB);
        const sub = current.brandSub.trim();
        const matchesNone = wantsNone && !sub;
        const matchesName = Boolean(sub) && wanted.some((name) => name.toLowerCase() === sub.toLowerCase());
        if (!matchesNone && !matchesName) return false;
      }
      if (sizeFilter) {
        const sizeMl = parseSize(sizeFilter)?.ml ?? null;
        const matchesMl = sizeMl != null && sizesMatch(current.sizeMl, sizeMl);
        const matchesLabel = current.size.trim().toLowerCase() === sizeFilter.trim().toLowerCase();
        if (!matchesMl && !matchesLabel) return false;
      }
      if (supplierFilter === "none" && current.supplierIds.length > 0) return false;
      if (supplierFilter && supplierFilter !== "none" && !current.supplierIds.includes(supplierFilter)) return false;
      if (salonFilter === "none" && current.branchIds.length > 0) return false;
      if (salonFilter && salonFilter !== "none" && !current.branchIds.includes(salonFilter)) return false;
      if (typeFilter === "none" && current.classification) return false;
      if (typeFilter && typeFilter !== "none" && current.classification !== typeFilter) return false;
      if (tagFilter === "none" && current.tagIds.length > 0) return false;
      if (tagFilter && tagFilter !== "none" && !current.tagIds.includes(tagFilter)) return false;
      const needle = query.trim();
      if (!needle) return true;
      return searchFieldsMatch(
        [current.sku, current.barcode, current.name, current.orderName, current.brand, current.brandSub, current.size, current.supplierName],
        needle,
      );
    },
    [brandFilter, brandSubFilter, overlayTick, query, salonFilter, sizeFilter, supplierFilter, tagFilter, typeFilter],
  );

  const brandSubOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (!rowMatchesFilters(row, true)) continue;
      const name = withBulkOverride(row).brandSub.trim();
      if (name) names.add(name);
    }
    for (const item of customBrandSubs) {
      if (!brandFilter || item.brand === brandFilter) names.add(item.name);
    }
    for (const name of brandSubFilter) {
      if (name && name !== NO_BRAND_SUB) names.add(name);
    }
    return [...names].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  }, [brandFilter, brandSubFilter, customBrandSubs, rowMatchesFilters, rows]);

  const brandSubsByBrand = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (brand: string, name: string) => {
      const key = brand.trim();
      const sub = name.trim();
      if (!key || !sub) return;
      const list = map.get(key) ?? [];
      if (!list.some((item) => item.toLowerCase() === sub.toLowerCase())) list.push(sub);
      map.set(key, list);
    };
    for (const row of rows) add(row.brand, row.brandSub);
    for (const item of customBrandSubs) add(item.brand, item.name);
    for (const [brand, list] of map) {
      list.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
      map.set(brand, list);
    }
    return map;
  }, [customBrandSubs, rows]);

  const sizeOptions = useMemo(() => {
    const seen = new Map<string, { label: string; ml: number | null }>();
    for (const row of rows) {
      const label = row.size.trim();
      if (!label) continue;
      const key = row.sizeMl != null ? `ml:${row.sizeMl}` : `label:${label.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { label, ml: row.sizeMl });
    }
    return [...seen.values()].sort((left, right) => {
      if (left.ml != null && right.ml != null) return left.ml - right.ml;
      if (left.ml != null) return -1;
      if (right.ml != null) return 1;
      return left.label.localeCompare(right.label);
    });
  }, [rows]);

  const gstBySupplier = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.gstRegistered])),
    [suppliers],
  );

  const catalogChoices = useMemo(
    () =>
      products
        .filter((product) => !product.isSet)
        .map((product) => ({
          id: product.id,
          label: productLabel(
            { sku: product.sku, name: product.name, orderName: product.orderName },
            product.id,
          ),
        })),
    [products],
  );

  const filtered = useMemo(() => {
    return rows
      .map((row, index) => ({ row: withBulkOverride(row), index }))
      .filter(({ row }) => {
        if (!row.id) return true;
        return rowMatchesFilters(row);
      });
  }, [overlayTick, rowMatchesFilters, rows]);

  const groupKeyFor = useCallback(
    (row: TableDraft) => rowGroupKey(row, groupBy, branches),
    [branches, groupBy],
  );

  const grouped = useMemo(() => {
    const byName = (left: { row: TableDraft }, right: { row: TableDraft }) =>
      left.row.orderName.localeCompare(right.row.orderName, undefined, { sensitivity: "base" });
    const items = [...filtered];
    if (groupBy === "brandSub") {
      const present = new Set(
        filtered
          .filter((item) => item.row.brandSub.trim())
          .map((item) => item.row.brandSub.trim().toLowerCase()),
      );
      const extras = customBrandSubs
        .filter((item) => {
          if (brandFilter && item.brand !== brandFilter) return false;
          if (present.has(item.name.toLowerCase())) return false;
          if (brandSubFilter.length === 0) return true;
          return brandSubFilter.some(
            (name) => name !== NO_BRAND_SUB && name.toLowerCase() === item.name.toLowerCase(),
          );
        })
        .map((item) => ({
          row: {
            ...emptyRow(branches.map((branch) => branch.id)),
            brand: item.brand,
            brandSub: item.name,
          },
          index: -1,
        }));
      items.push(...extras);
    }
    items.sort((left, right) => {
      if (groupBy !== "none") {
        const cmp = groupSortPrefix(groupKeyFor(left.row)).localeCompare(
          groupSortPrefix(groupKeyFor(right.row)),
          undefined,
          { sensitivity: "base" },
        );
        if (cmp !== 0) return cmp;
      }
      if (!left.row.id && right.row.id) return -1;
      if (left.row.id && !right.row.id) return 1;
      return byName(left, right);
    });
    return items;
  }, [brandFilter, brandSubFilter, branches, customBrandSubs, filtered, groupBy, groupKeyFor]);

  const listedProductCount = grouped.filter((item) => item.index >= 0).length;
  const exportRows = useMemo(
    () => grouped.filter((item) => item.index >= 0 && rowHasCatalogExport(item.row)).map((item) => item.row),
    [grouped],
  );

  const displayGrouped = useMemo(() => {
    if (collapsedGroups.size === 0) return grouped;
    const seen = new Set<string>();
    const next: typeof grouped = [];
    for (const item of grouped) {
      const key = groupKeyFor(item.row);
      if (!collapsedGroups.has(key)) {
        next.push(item);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(item);
    }
    return next;
  }, [collapsedGroups, groupKeyFor, grouped]);

  const pageCount = Math.max(1, Math.ceil(displayGrouped.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = displayGrouped.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const columnCount = 24;
  const usedInBundles = useMemo(() => {
    const byChild = new Map<string, string[]>();
    for (const row of rows) {
      const contents = withBulkOverride(row).componentLabels;
      if (contents.length === 0) continue;
      const parentName = productDisplayName(row) || row.orderName.trim() || "Untitled bundle";
      for (const item of contents) {
        if (!item.productId) continue;
        const quantity = Number(item.quantity);
        const label =
          Number.isFinite(quantity) && quantity > 0 && quantity !== 1
            ? `${parentName} · ${formatQty(quantity)}×`
            : parentName;
        const list = byChild.get(item.productId) ?? [];
        if (!list.includes(label)) list.push(label);
        byChild.set(item.productId, list);
      }
    }
    return byChild;
  }, [overlayTick, rows]);
  const nameLeft = `${SELECT_COL_REM + SALON_TAGS_REM}rem`;
  const rowBg = (selectedRow: boolean) => (selectedRow ? "bg-slate-50" : "bg-card");

  useEffect(() => {
    const node = headRef.current;
    if (!node) return;
    const sync = () => setHeadHeight(Math.ceil(node.getBoundingClientRect().height));
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [columnCount]);

  function toggleGroupCollapse(groupKey: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const allGroupKeys = useMemo(
    () => [...new Set(grouped.map((item) => groupKeyFor(item.row)))],
    [groupKeyFor, grouped],
  );
  const allGroupsCollapsed = allGroupKeys.length > 0 && allGroupKeys.every((key) => collapsedGroups.has(key));

  function collapseAllGroups() {
    setCollapsedGroups(new Set(allGroupKeys));
    setPage(0);
  }

  function expandAllGroups() {
    setCollapsedGroups(new Set());
    setPage(0);
  }

  function downloadFilteredCsv() {
    if (exportRows.length === 0) return;
    downloadCsv(
      `maax-products-${new Date().toISOString().slice(0, 10)}.csv`,
      exportRows.map((row) =>
        catalogCsvRow(row, { branches, suppliers, gstBySupplier, gstRate, usedInBundles }),
      ),
    );
  }

  function createBrandSub(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !brandFilter) return;
    const exists = brandSubOptions.some((item) => item.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setCustomBrandSubs((current) =>
        current.some(
          (item) => item.brand === brandFilter && item.name.toLowerCase() === trimmed.toLowerCase(),
        )
          ? current
          : [...current, { brand: brandFilter, name: trimmed }],
      );
    }
    setGroupBy("brandSub");
    setBrandSubFilter((current) => {
      if (current.length === 0) return current;
      if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return current;
      return [...current, trimmed];
    });
    setPage(0);
  }
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of grouped) {
      if (item.index < 0) continue;
      const key = groupKeyFor(item.row);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [groupKeyFor, grouped]);

  const selectableIds = useMemo(
    () => grouped.map((item) => item.row.id).filter((id): id is string => Boolean(id)),
    [grouped],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  const selectedCount = selected.length;

  function updateRow(index: number, patch: Partial<TableDraft>) {
    setRows((current) => {
      const next = current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (row.id) {
          dirtyIdsRef.current.add(row.id);
          const currentOverride = bulkOverrides.get(row.id);
          if (currentOverride) bulkOverrides.set(row.id, { ...currentOverride, ...patch });
        }
        const updated = { ...row, ...patch };
        if (patch.size != null) {
          updated.sizeMl = parseSize(patch.size)?.ml ?? null;
        }
        if (patch.isSet === false) {
          updated.components = [];
          updated.componentLabels = [];
        }
        if (patch.isSet != null) {
          const bundleTag = tags.find((tag) => tag.name.trim().toLowerCase() === "bundle");
          if (bundleTag) {
            if (patch.isSet) {
              if (!updated.tagIds.includes(bundleTag.id)) {
                updated.tagIds = [...updated.tagIds, bundleTag.id];
                updated.tagNames = [...updated.tagNames, bundleTag.name];
              }
            } else {
              const kept = updated.tagIds
                .map((id, tagIndex) => ({ id, name: updated.tagNames[tagIndex] ?? "" }))
                .filter((tag) => tag.id !== bundleTag.id);
              updated.tagIds = kept.map((tag) => tag.id);
              updated.tagNames = kept.map((tag) => tag.name);
            }
          }
        }
        return updated;
      });
      const row = next[index];
      if (row && patch.unitCost != null && row.isSet && row.componentLabels.length === 1) {
        const withCosts = withParentContents(row, row.componentLabels);
        next[index] = withCosts;
        return inheritChildCosts(next, withCosts.componentLabels, dirtyIdsRef.current);
      }
      return next;
    });
    setDirty((current) => new Set(current).add(index));
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addRow() {
    setRows((current) => [emptyRow(branches.map((branch) => branch.id)), ...current]);
    setDirty((current) => new Set([...current].map((index) => index + 1)));
    setBundleIndex((current) => (current == null ? null : current + 1));
    setPage(0);
    setError(null);
    setMessage(null);
  }

  function groupProductIds(groupKey: string) {
    return grouped
      .filter((item) => groupKeyFor(item.row) === groupKey)
      .map((item) => item.row.id)
      .filter((id): id is string => Boolean(id));
  }

  function toggleGroup(groupKey: string) {
    const ids = groupProductIds(groupKey);
    if (ids.length === 0) return;
    setSelected((current) => {
      const allSelectedInGroup = ids.every((id) => current.includes(id));
      if (allSelectedInGroup) return current.filter((id) => !ids.includes(id));
      return [...new Set([...current, ...ids])];
    });
  }

  function toggleAll() {
    setSelected(allSelected ? [] : [...new Set(selectableIds)]);
  }

  const hasUnsaved = dirty.size > 0 || dirtyIdsRef.current.size > 0;

  function applyToSelected(productIds: string[], patch: Partial<TableDraft>) {
    const ids = new Set(productIds);
    for (const id of ids) {
      bulkOverrides.set(id, { ...bulkOverrides.get(id), ...patch });
    }
    setRows((current) =>
      current.map((row) => (row.id && ids.has(row.id) ? { ...row, ...patch } : row)),
    );
    setRecentBulkIds(new Set(ids));
    setOverlayTick((tick) => tick + 1);
  }

  async function applyBulk(fields: BulkEditFields) {
    if (selectedCount === 0) {
      throw new Error("Select at least one product.");
    }
    const productIds = [...selected];
    const patch = bulkFieldsToPatch(fields, tags, suppliers);
    applyToSelected(productIds, patch);
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await postCatalogBulk({ productIds, fields });
      applyToSelected(productIds, patch);
      setBulkOpen(false);
      setSnapshotAt(new Date());
      router.refresh();
      setMessage(`Updated ${productIds.length} product${productIds.length === 1 ? "" : "s"}.`);
    } catch (err) {
      for (const id of productIds) bulkOverrides.delete(id);
      router.refresh();
      setError(err instanceof Error ? err.message : "Could not update products.");
      throw err;
    } finally {
      setPending(false);
    }
  }

  async function enterEdit() {
    dirtyIdsRef.current.clear();
    setDirty(new Set());
    setError(null);
    setMessage(null);
    setSnapshotAt(new Date());
    await router.refresh();
    setEditing(true);
  }

  function leaveEdit() {
    dirtyIdsRef.current.clear();
    setDirty(new Set());
    setBundleIndex(null);
    setBulkOpen(false);
    setError(null);
    setMessage(null);
    setEditing(false);
    setSnapshotAt(new Date());
    router.refresh();
  }

  function persistableDrafts() {
    return rows.filter((row, index) => {
      if (!row.orderName.trim()) return false;
      if (!row.id) return dirty.has(index);
      return dirty.has(index) || dirtyIdsRef.current.has(row.id);
    });
  }

  async function onSave() {
    const drafts = persistableDrafts();
    if (drafts.length === 0) {
      setError("Nothing to save. Edit a product or add an order name on a new row.");
      return false;
    }
    const incomplete = drafts.find(
      (row) =>
        row.isSet &&
        row.componentLabels.length > 1 &&
        !bundleCostsComplete(
          Number(row.unitCost) || 0,
          row.componentLabels.map((item) => parsedAllocatedCost(item.allocatedCost)),
        ),
    );
    if (incomplete) {
      setError(
        `Enter a cost breakdown for ${productDisplayName(incomplete) || incomplete.orderName || "the mixed bundle"} that adds up to its unit cost.`,
      );
      return false;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveProducts(
        drafts.map((row) => ({
          ...row,
          components: row.componentLabels.length > 0 ? contentsPayload(row.componentLabels) : row.components,
        })),
      );
      const leftover = [...(result.saved ?? [])];
      dirtyIdsRef.current.clear();
      setRows((current) =>
        current
          .map((row) => {
            if (row.id) return row;
            const byKey = leftover.findIndex((item) => item.clientKey && item.clientKey === row.clientKey);
            if (byKey >= 0) {
              const id = leftover[byKey].id;
              leftover.splice(byKey, 1);
              return { ...row, id };
            }
            return row;
          })
          .filter((row) => row.id || row.orderName.trim() || row.name.trim()),
      );
      setDirty(new Set());
      setSnapshotAt(new Date());
      await router.refresh();
      setMessage(`Saved ${drafts.filter((row) => row.orderName.trim()).length} product${drafts.length === 1 ? "" : "s"}.`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save products.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function finishEdit() {
    if (persistableDrafts().length > 0) {
      const saved = await onSave();
      if (!saved) return;
    }
    leaveEdit();
  }

  function reloadCatalog() {
    if (editing && hasUnsaved) return;
    setSnapshotAt(new Date());
    router.refresh();
  }

  function setRowTag(index: number, tagId: string) {
    const tag = tags.find((item) => item.id === tagId);
    updateRow(index, {
      tagIds: tag ? [tag.id] : [],
      tagNames: tag ? [tag.name] : [],
    });
  }

  function setRowSupplier(index: number, supplierId: string) {
    const current = rows[index];
    if (!current) return;
    const supplier = suppliers.find((item) => item.id === supplierId);
    updateRow(index, {
      supplierIds: supplier ? [supplier.id] : [],
      supplierName: supplier?.name ?? "",
      gstRegistered: supplier?.gstRegistered ?? false,
    });
  }

  function setRowBranches(index: number, branchIds: string[]) {
    updateRow(index, { branchIds });
  }

  function setBundleContents(index: number, contents: BundleDraft[]) {
    setRows((current) => {
      const parent = current[index];
      if (!parent) return current;
      if (parent.id) dirtyIdsRef.current.add(parent.id);
      const withCosts = withParentContents(parent, contents);
      const next = current.map((row, rowIndex) => (rowIndex === index ? withCosts : row));
      return inheritChildCosts(next, withCosts.componentLabels, dirtyIdsRef.current);
    });
    setDirty((current) => new Set(current).add(index));
  }

  async function onDelete(index: number) {
    const row = rows[index];
    if (!row) return;
    const bundles = row.id ? (usedInBundles.get(row.id) ?? []) : [];
    if (bundles.length > 0) {
      setError(
        `Cannot delete this product because it is part of ${bundles.join(", ")}. Remove it from those bundles first.`,
      );
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      if (row.id) {
        dirtyIdsRef.current.delete(row.id);
        const result = await deleteProduct(row.id);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setSelected((current) => current.filter((id) => id !== row.id));
      }
      setRows((current) => {
        const next = current.filter((_, rowIndex) => rowIndex !== index);
        if (editing) {
          return next.length > 0 ? next : [emptyRow(branches.map((branch) => branch.id))];
        }
        return next;
      });
      setSnapshotAt(new Date());
      router.refresh();
    } catch (err) {
      unstable_rethrow(err);
      setError(err instanceof Error ? err.message : "Could not delete that product.");
    } finally {
      setPending(false);
    }
  }

  const editingBundle = bundleIndex == null ? null : rows[bundleIndex];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {editing
            ? `Editing catalog. Snapshot from ${snapshotAt.toLocaleString()}. Click Done to save if this is your session.`
            : "Viewing catalog. Open Edit catalog to change products."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p
            className="text-sm text-muted"
            title="Set when someone clicks Done after saving catalog edits. This tab also reloads when you come back to it."
          >
            {formatCatalogSavedLabel(catalogSavedAt, catalogSavedByEmail)}
          </p>
          <button
            className={btnSecondaryClass}
            type="button"
            disabled={exportRows.length === 0}
            onClick={downloadFilteredCsv}
            title="Download the filtered product list as CSV"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span>Find product</span>
          <input
            className={fieldClass}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="SKU, barcode, or name"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>Brand</span>
          <select
            className={fieldClass}
            value={brandFilter}
            onChange={(event) => {
              setBrandFilter(event.target.value);
              setBrandSubFilter([]);
              setPage(0);
            }}
          >
            <option value="">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>
        <div>
          <BrandSubFilter
            brand={brandFilter}
            options={brandSubOptions}
            selected={brandSubFilter}
            onChange={(values) => {
              setBrandSubFilter(values);
              setPage(0);
            }}
            onCreate={createBrandSub}
            disabled={pending}
          />
        </div>
        <label className="space-y-1 text-sm">
          <span>Salon</span>
          <select
            className={fieldClass}
            value={salonFilter}
            onChange={(event) => {
              setSalonFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All salons</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {salonChipLabel(branch.name)}
              </option>
            ))}
            <option value="none">No salon</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Size</span>
          <select
            className={fieldClass}
            value={sizeFilter}
            onChange={(event) => {
              setSizeFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All sizes</option>
            {sizeOptions.map((size) => (
              <option key={`${size.ml ?? size.label}:${size.label}`} value={size.label}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Supplier</span>
          <select
            className={fieldClass}
            value={supplierFilter}
            onChange={(event) => {
              setSupplierFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All suppliers</option>
            <option value="none">No supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Type</span>
          <select
            className={fieldClass}
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All types</option>
            {CLASSIFICATIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value="none">No type</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Tag</span>
          <select
            className={fieldClass}
            value={tagFilter}
            onChange={(event) => {
              setTagFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
            <option value="none">No tag</option>
          </select>
        </label>
      </div>
      <div className="flex items-end gap-3 self-start rounded-xl border border-sky-300 bg-sky-200 px-4 py-3">
        <label className="min-w-40 space-y-1 text-sm">
          <span className="font-medium text-sky-950">Group by</span>
          <select
            className={cn(fieldClass, "border-sky-400 bg-sky-100")}
            value={groupBy}
            onChange={(event) => {
              setGroupBy(event.target.value as GroupBy);
              setCollapsedGroups(new Set());
              setPage(0);
            }}
          >
            {GROUP_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {groupBy !== "none" ? (
          <button
            className="inline-flex items-center justify-center rounded-lg border border-sky-300 bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            type="button"
            onClick={allGroupsCollapsed ? expandAllGroups : collapseAllGroups}
          >
            {allGroupsCollapsed ? "Expand all groups" : "Collapse all groups"}
          </button>
        ) : null}
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {listedProductCount} product{listedProductCount === 1 ? "" : "s"}
          {displayGrouped.length > pageSize
            ? ` · showing ${currentPage * pageSize + 1}–${Math.min(displayGrouped.length, currentPage * pageSize + pageSize)}`
            : ""}
          {groupBy !== "none"
            ? ` · grouped by ${GROUP_BY_OPTIONS.find((option) => option.value === groupBy)?.label}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <button className={btnSecondaryClass} type="button" onClick={addRow}>
              Add product
            </button>
          ) : null}
          {editing ? (
            <button className={btnClass} type="button" disabled={pending} onClick={() => void finishEdit()}>
              {pending ? "Saving…" : "Done"}
            </button>
          ) : (
            <button className={btnClass} type="button" disabled={pending} onClick={() => void enterEdit()}>
              Edit catalog
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {[...brandSubsByBrand.entries()].map(([brand, names]) => (
        <datalist key={brand} id={brandSubListId(brand)}>
          {names.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ))}

      <div className="max-h-[min(70vh,44rem)] overflow-auto rounded-xl border border-border bg-card">
        <table className={cn(tableClass, "border-separate border-spacing-0")}>
          <thead ref={headRef}>
            <tr>
              <th className={cn(thClass, wCheck, stickyCheckHead)}>
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all products"
                  />
                  <button
                    className={cn(
                      "whitespace-nowrap text-sm font-medium underline",
                      editing ? "text-blue-600" : "text-slate-900",
                    )}
                    type="button"
                    disabled={!editing || pending || selectedCount === 0}
                    title={
                      !editing
                        ? "Edit catalog to bulk edit"
                        : selectedCount === 0
                          ? "Select products first"
                          : "Bulk edit selected products"
                    }
                    onClick={() => setBulkOpen(true)}
                  >
                    Bulk edit
                  </button>
                </div>
              </th>
              <th
                className={cn(thClass, wSalons, stickySalonsHead)}
                style={{ left: `${SELECT_COL_REM}rem` }}
              >
                Salons
              </th>
              <th className={cn(thClass, wName, stickyNameHead)} style={{ left: nameLeft }}>
                Order name
              </th>
              <th className={cn(thClass, wFriendly, stickyHead)}>Name</th>
              <th className={cn(thClass, wField, stickyHead)}>SKU</th>
              <th className={cn(thClass, wField, stickyHead)}>Barcode</th>
              <th className={cn(thClass, wField, stickyHead)}>Brand</th>
              <th className={cn(thClass, wField, stickyHead)}>Brand_sub</th>
              <th className={cn(thClass, wField, stickyHead)}>Size</th>
              <th className={cn(thClass, wType, stickyHead)}>Type</th>
              <th className={cn(thClass, wContents, stickyHead)}>Tags</th>
              <th className={cn(thClass, wSupplier, stickyHead)}>Supplier</th>
              <th className={cn(thClass, wField, stickyHead)}>Unit cost</th>
              <th className={cn(thClass, wField, stickyHead)}>Tax amount</th>
              <th className={cn(thClass, wField, stickyHead)}>Unit cost with tax</th>
              <th className={cn(thClass, wField, stickyHead)} title="Recommended retail price from the supplier">
                RRP
              </th>
              <th className={cn(thClass, wField, stickyHead)} title="Confirmed retail price. Uses RRP when RRP is above 0, otherwise unit cost × 2.">
                CRP
              </th>
              <th className={cn(thClass, wField, stickyHead)} title="(CRP − unit cost) ÷ CRP">
                Gross margin
              </th>
              <th className={cn(thClass, wField, stickyHead)} title="(CRP − unit cost with tax) ÷ CRP">
                Gross margin 2
              </th>
              <th className={cn(thClass, wField, stickyHead)}>Threshold</th>
              <th className={cn(thClass, wCheck, stickyHead)} title="This SKU is a bundle of other products, not a salon assignment.">
                Bundle
              </th>
              <th className={cn(thClass, wContents, stickyHead)}>Contents</th>
              <th
                className={cn(thClass, wContents, stickyHead)}
                title="Which bundle SKUs include this product, and how many per kit."
              >
                In bundle
              </th>
              <th className={cn(thClass, wField, stickyHead)} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={columnCount}>
                  No products match that search.
                </td>
              </tr>
            ) : (
              visible.map(({ row, index }, visibleIndex) => {
                const isSelected = Boolean(row.id && selected.includes(row.id));
                const gstRegistered =
                  row.supplierIds.length > 0
                    ? row.supplierIds.some((id) => gstBySupplier.get(id))
                    : row.gstRegistered;
                const unitCost = Number(row.unitCost) || 0;
                const pricing = catalogTax(unitCost, gstRegistered, gstRate);
                const crp = confirmedRetailPrice(unitCost, row.rrp === "" ? null : Number(row.rrp));
                const margin = grossMarginPercent(crp, unitCost);
                const marginWithTax = grossMarginPercent(crp, pricing.unitCostWithTax);
                const groupKey = groupKeyFor(row);
                const previous = visible[visibleIndex - 1];
                const previousKey = previous ? groupKeyFor(previous.row) : null;
                const showGroup = groupBy !== "none" && previousKey !== groupKey;
                const groupIds = showGroup ? groupProductIds(groupKey) : [];
                const groupSelectedCount = groupIds.filter((id) => selected.includes(id)).length;
                const groupCollapsed = collapsedGroups.has(groupKey);
                const justUpdated = Boolean(row.id && recentBulkIds.has(row.id));
                const updatedCell = justUpdated ? "ring-2 ring-emerald-400 ring-inset" : "";
                const inBundles = row.id ? usedInBundles.get(row.id) ?? [] : [];
                const salonLabels = row.branchIds
                  .map((id) => {
                    const branch = branches.find((item) => item.id === id);
                    return branch ? salonChipLabel(branch.name) : "";
                  })
                  .filter(Boolean)
                  .join(", ");
                const contentsLabel = row.isSet
                  ? row.componentLabels.length === 0
                    ? "Choose products"
                    : row.componentLabels.length === 1
                      ? "1 item"
                      : bundleCostsComplete(
                            Number(row.unitCost) || 0,
                            row.componentLabels.map((item) => parsedAllocatedCost(item.allocatedCost)),
                          )
                        ? `${row.componentLabels.length} items`
                        : `${row.componentLabels.length} items · set cost split`
                  : "—";
                return (
                  <Fragment key={index < 0 ? `empty-group-${row.brand}-${row.brandSub}` : row.id ?? `new-${index}`}>
                    {showGroup ? (
                      <tr className={groupCollapsed ? "bg-slate-200" : "bg-slate-100"}>
                        <td
                          className={cn(
                            tdClass,
                            "pointer-events-none sticky z-20 font-semibold",
                            groupCollapsed ? "bg-slate-200" : "bg-slate-100",
                          )}
                          colSpan={columnCount}
                          style={{ top: headHeight }}
                        >
                          <div
                            className={cn(
                              "pointer-events-auto sticky left-0 inline-flex w-max items-center gap-2",
                              groupCollapsed ? "bg-slate-200" : "bg-slate-100",
                            )}
                          >
                            {groupIds.length > 0 ? (
                              <input
                                type="checkbox"
                                className={checkboxClass}
                                checked={groupSelectedCount === groupIds.length}
                                ref={(input) => {
                                  if (!input) return;
                                  input.indeterminate =
                                    groupSelectedCount > 0 && groupSelectedCount < groupIds.length;
                                }}
                                onChange={() => toggleGroup(groupKey)}
                                aria-label={`Select ${groupKey}`}
                              />
                            ) : null}
                            <button
                              className="inline-flex items-center gap-2 text-left"
                              type="button"
                              onClick={() => toggleGroupCollapse(groupKey)}
                              aria-expanded={!groupCollapsed}
                              aria-label={`${groupCollapsed ? "Expand" : "Collapse"} ${groupKey}`}
                            >
                              <span aria-hidden="true" className="w-3 text-xs text-muted">
                                {groupCollapsed ? "▸" : "▾"}
                              </span>
                              <span>
                                {groupKey} · {groupCounts.get(groupKey) ?? 0} product
                                {(groupCounts.get(groupKey) ?? 0) === 1 ? "" : "s"}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  {groupCollapsed || index < 0 ? null : (
                  <tr className={isSelected ? "bg-slate-50" : "bg-card"}>
                    <td className={cn(tdClass, wCheck, stickyCheck, rowBg(isSelected))}>
                      {row.id ? (
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={isSelected}
                          onChange={() => toggleOne(row.id!)}
                          aria-label={`Select ${productDisplayName(row) || row.orderName || "product"}`}
                        />
                      ) : null}
                    </td>
                    <td
                      className={cn(tdClass, wSalons, stickySalons, rowBg(isSelected), updatedCell)}
                      style={{ left: `${SELECT_COL_REM}rem` }}
                    >
                      {editing ? (
                        <SalonChipField
                          compact
                          branches={branches}
                          selectedIds={row.branchIds}
                          onChange={(ids) => setRowBranches(index, ids)}
                          disabled={pending}
                          ariaLabel={`Salons for ${productDisplayName(row) || row.orderName || "product"}`}
                        />
                      ) : (
                        <ViewValue>{dash(salonLabels)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wName, stickyName, rowBg(isSelected))} style={{ left: nameLeft }}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wName)}
                          value={row.orderName}
                          autoFocus={!row.id && visibleIndex === 0 && currentPage === 0}
                          placeholder={!row.id ? "Order name" : undefined}
                          onChange={(event) => updateRow(index, { orderName: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.orderName)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wFriendly)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wFriendly)}
                          value={row.name}
                          placeholder="Optional"
                          onChange={(event) => updateRow(index, { name: event.target.value })}
                          aria-label={`Recognizable name for ${row.orderName || "product"}`}
                        />
                      ) : (
                        <ViewValue>{dash(row.name)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          value={row.sku}
                          onChange={(event) => updateRow(index, { sku: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.sku)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          value={row.barcode}
                          onChange={(event) => updateRow(index, { barcode: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.barcode)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          value={row.brand}
                          onChange={(event) => updateRow(index, { brand: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.brand)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          value={row.brandSub}
                          list={row.brand.trim() ? brandSubListId(row.brand) : undefined}
                          onChange={(event) => updateRow(index, { brandSub: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.brandSub)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          value={row.size}
                          onChange={(event) => updateRow(index, { size: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{dash(row.size)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wType)}>
                      {editing ? (
                        <select
                          key={`type-${row.id ?? index}-${row.classification || "none"}`}
                          className={cn(fieldClass, wType, updatedCell)}
                          value={row.classification || ""}
                          onChange={(event) =>
                            updateRow(index, { classification: event.target.value as ProductClassification | "" })
                          }
                        >
                          <option value="">None</option>
                          {CLASSIFICATIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <ViewValue>
                          {row.classification ? classificationLabel(row.classification) : "—"}
                        </ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wContents)}>
                      {editing ? (
                        tags.length === 0 ? (
                          <span className="text-sm text-muted">—</span>
                        ) : (
                          <select
                            key={`tag-${row.id ?? index}-${row.tagIds[0] ?? "none"}`}
                            className={cn(fieldClass, wContents, updatedCell)}
                            value={row.tagIds[0] ?? ""}
                            onChange={(event) => setRowTag(index, event.target.value)}
                            aria-label={`Tag for ${productDisplayName(row) || row.orderName || "product"}`}
                          >
                            <option value="">None</option>
                            {tags.map((tag) => (
                              <option key={tag.id} value={tag.id}>
                                {tag.name}
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        <ViewValue>{dash(row.tagNames.filter(Boolean).join(", "))}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wSupplier)}>
                      {editing ? (
                        suppliers.length === 0 && !row.supplierIds[0] ? (
                          <span className="text-sm text-muted">—</span>
                        ) : (
                          <select
                            className={cn(fieldClass, wSupplier)}
                            value={row.supplierIds[0] ?? ""}
                            onChange={(event) => setRowSupplier(index, event.target.value)}
                            aria-label={`Supplier for ${productDisplayName(row) || row.orderName || "product"}`}
                          >
                            <option value="">None</option>
                            {row.supplierIds[0] && !suppliers.some((supplier) => supplier.id === row.supplierIds[0]) ? (
                              <option value={row.supplierIds[0]}>{row.supplierName || "Unknown supplier"}</option>
                            ) : null}
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        <ViewValue>
                          {dash(
                            suppliers.find((item) => item.id === row.supplierIds[0])?.name ?? row.supplierName,
                          )}
                        </ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitCost}
                          onChange={(event) => updateRow(index, { unitCost: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{formatMoney(unitCost)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      <span className="block min-w-28 text-sm">
                        {formatMoney(pricing.taxAmount)}
                      </span>
                    </td>
                    <td className={cn(tdClass, wField)}>
                      <span className="block min-w-28 text-sm">{formatMoney(pricing.unitCostWithTax)}</span>
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.rrp}
                          onChange={(event) => updateRow(index, { rrp: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{row.rrp === "" ? "—" : formatMoney(Number(row.rrp))}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      <span className="block min-w-28 text-sm">{formatMoney(crp)}</span>
                    </td>
                    <td className={cn(tdClass, wField)}>
                      <span className="block min-w-28 text-sm">{formatPercent(margin)}</span>
                    </td>
                    <td className={cn(tdClass, wField)}>
                      <span className="block min-w-28 text-sm">{formatPercent(marginWithTax)}</span>
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <input
                          className={cn(fieldClass, wField)}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.threshold}
                          onChange={(event) => updateRow(index, { threshold: event.target.value })}
                        />
                      ) : (
                        <ViewValue>{row.threshold === "" ? "—" : dash(row.threshold)}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wCheck)}>
                      {editing ? (
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={row.isSet}
                          onChange={(event) => updateRow(index, { isSet: event.target.checked })}
                          aria-label={`Mark ${productDisplayName(row) || row.orderName || "product"} as a bundle`}
                          title="Bundle of other products, not a salon assignment"
                        />
                      ) : (
                        <ViewValue>{row.isSet ? "Yes" : "No"}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wContents)}>
                      {editing ? (
                        <button
                          className={cn(btnSecondaryClass, "min-w-56 whitespace-nowrap")}
                          type="button"
                          disabled={!row.isSet}
                          onClick={() => {
                            setBundleQuery("");
                            setBundleIndex(index);
                          }}
                        >
                          {contentsLabel}
                        </button>
                      ) : (
                        <ViewValue>{contentsLabel === "Choose products" ? "—" : contentsLabel}</ViewValue>
                      )}
                    </td>
                    <td className={cn(tdClass, wContents)}>
                      {inBundles.length > 0 ? (
                        <span className="block min-w-56 max-w-72 truncate text-sm" title={inBundles.join(", ")}>
                          {inBundles.join(", ")}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </td>
                    <td className={cn(tdClass, wField)}>
                      {editing ? (
                        <button
                          className="text-sm text-muted underline"
                          type="button"
                          disabled={pending}
                          onClick={() => onDelete(index)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Rows</span>
          <select
            className={cn(fieldClass, "w-24")}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        {pageCount > 1 ? (
          <>
            <button
              className={btnSecondaryClass}
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <button
              className={btnSecondaryClass}
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </button>
            <span className="text-sm text-muted">
              Page {currentPage + 1} of {pageCount}
            </span>
          </>
        ) : null}
      </div>

      {editing ? (
        <BulkEditModal
          open={bulkOpen}
          pending={pending}
          selectedCount={selectedCount}
          tags={tags}
          branches={branches}
          suppliers={suppliers}
          brandOptions={brandOptions}
          brandSubsByBrand={brandSubsByBrand}
          onClose={() => setBulkOpen(false)}
          onApply={applyBulk}
        />
      ) : null}

      {editingBundle && bundleIndex != null ? (
        <BundlePicker
          title={productDisplayName(editingBundle) || editingBundle.orderName || "Bundle contents"}
          excludeId={editingBundle.id}
          parentUnitCost={Number(editingBundle.unitCost) || 0}
          selected={editingBundle.componentLabels}
          choices={catalogChoices}
          query={bundleQuery}
          onQueryChange={setBundleQuery}
          onChange={(contents) => setBundleContents(bundleIndex, contents)}
          onPersist={async (contents) => {
            if (!editingBundle.id) return;
            const allocated = autoAllocateBundleCosts(Number(editingBundle.unitCost) || 0, contents);
            await postCatalogBundle({
              productId: editingBundle.id,
              unitCost: Number(editingBundle.unitCost) || 0,
              components: contentsPayload(allocated),
              replaceEmpty: allocated.length === 0,
            });
          }}
          onClose={() => setBundleIndex(null)}
        />
      ) : null}
    </div>
  );
}

function BundlePicker({
  title,
  excludeId,
  parentUnitCost,
  selected,
  choices,
  query,
  onQueryChange,
  onChange,
  onPersist,
  onClose,
}: {
  title: string;
  excludeId?: string;
  parentUnitCost: number;
  selected: BundleDraft[];
  choices: { id: string; label: string }[];
  query: string;
  onQueryChange: (value: string) => void;
  onChange: (contents: BundleDraft[]) => void;
  onPersist?: (contents: BundleDraft[]) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedIds = new Set(selected.map((item) => item.productId));
  const matches = choices
    .filter((choice) => choice.id !== excludeId && !selectedIds.has(choice.id))
    .filter((choice) => searchTextMatches(choice.label, query))
    .slice(0, 20);
  const mixed = selected.length > 1;
  const allocated = selected.map((item) => parsedAllocatedCost(item.allocatedCost));
  const complete = bundleCostsComplete(parentUnitCost, allocated);
  const remaining = bundleCostRemainder(parentUnitCost, allocated);
  const singleSku = selected.length === 1;

  async function tryClose() {
    if (mixed && !complete) {
      setError("Enter a cost share for each product. Shares must add up to the bundle unit cost.");
      return;
    }
    if (onPersist) {
      setSaving(true);
      setError(null);
      try {
        await onPersist(selected);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save bundle contents.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Bundle contents</h3>
            <p className="text-sm text-muted">
              {title}. Qty is how many of each SKU one bundle contains. Child unit cost is inherited from this
              bundle: {formatMoney(parentUnitCost)}
              {singleSku ? " divided by quantity." : " split across the products below."}
            </p>
          </div>
          <button className={btnSecondaryClass} type="button" disabled={saving} onClick={() => void tryClose()}>
            {saving ? "Saving…" : "Done"}
          </button>
        </div>

        {mixed ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This kit has more than one product. Enter how much of the bundle cost belongs to each line. The
            shares must add up to {formatMoney(parentUnitCost)}.
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <div className="mt-4 space-y-2">
          {selected.length === 0 ? (
            <p className="text-sm text-muted">No products in this bundle yet.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_6.5rem_auto] gap-2 text-xs font-medium text-muted sm:grid">
                <span>Product</span>
                <span>Qty</span>
                <span>Share of bundle cost</span>
                <span>Cost each</span>
                <span />
              </div>
              {selected.map((item) => {
                const share = parsedAllocatedCost(item.allocatedCost);
                const each = share == null ? null : inheritedUnitCost(share, Number(item.quantity) || 0);
                return (
                  <div
                    key={item.productId}
                    className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_6.5rem_auto]"
                  >
                    <p className="min-w-0 truncate text-sm">{item.label}</p>
                    <label className="space-y-1 text-sm sm:space-y-0">
                      <span className="text-muted sm:hidden">Qty</span>
                      <input
                        className={cn(fieldClass, "w-full")}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = Number(event.target.value);
                          setError(null);
                          onChange(
                            selected.map((current) =>
                              current.productId === item.productId ? { ...current, quantity } : current,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-sm sm:space-y-0">
                      <span className="text-muted sm:hidden">Share of bundle cost</span>
                      <input
                        className={cn(fieldClass, "w-full")}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.allocatedCost}
                        readOnly={singleSku}
                        onChange={(event) => {
                          setError(null);
                          onChange(
                            selected.map((current) =>
                              current.productId === item.productId
                                ? { ...current, allocatedCost: event.target.value }
                                : current,
                            ),
                          );
                        }}
                        aria-label={`Cost share for ${item.label}`}
                      />
                    </label>
                    <p className="text-sm text-muted">{each == null ? "—" : formatMoney(each)}</p>
                    <button
                      className="justify-self-start text-sm text-muted underline"
                      type="button"
                      onClick={() => {
                        setError(null);
                        onChange(selected.filter((current) => current.productId !== item.productId));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              <p className={cn("text-sm", mixed && !complete ? "text-red-700" : "text-muted")}>
                {mixed && allocated.some((value) => value == null)
                  ? "Enter a cost share for every product."
                  : `Allocated ${formatMoney(allocatedBundleTotal(allocated))} of ${formatMoney(parentUnitCost)}. Remaining ${formatMoney(remaining)}.`}
              </p>
            </>
          )}
        </div>

        <label className="mt-4 block space-y-1 text-sm">
          <span>Add product</span>
          <input
            className={fieldClass}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search SKU or name"
          />
        </label>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="text-sm text-muted">No matching single products.</p>
          ) : (
            matches.map((choice) => (
              <button
                key={choice.id}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setError(null);
                  const resetShares = selected.length === 1;
                  onChange([
                    ...selected.map((item) => (resetShares ? { ...item, allocatedCost: "" } : item)),
                    { productId: choice.id, quantity: 1, label: choice.label, allocatedCost: "" },
                  ]);
                }}
              >
                {choice.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
