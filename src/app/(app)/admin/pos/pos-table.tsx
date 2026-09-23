"use client";

import { Fragment, useMemo, useState } from "react";
import { deletePosTagRule, getPosBranchExportRows, savePosTagRule } from "./actions";
import type { PosTagRule } from "@/lib/data/pos-rules";
import { downloadCsv } from "@/lib/csv";
import { productDisplayName } from "@/lib/format";
import { btnClass, btnSecondaryClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

type PosProduct = {
  id: string;
  name: string;
  orderName: string;
  sku: string | null;
  barcode: string | null;
  brand: string;
  typeLabel: string;
  sizeLabel: string | null;
  posAllowed: boolean;
  branchIds: string[];
  tagIds: string[];
  tagNames: string[];
};

type BranchOption = { id: string; label: string };
type TagOption = { id: string; name: string };

const UNBRANDED_LABEL = "No brand";
const stickyHead = "sticky top-0 z-20 bg-card";

function nameWithSize(product: PosProduct) {
  const name = productDisplayName(product) || product.sku || "";
  return product.sizeLabel ? `${name} ${product.sizeLabel}`.trim() : name;
}

export function PosTable({
  products: initialProducts,
  branches,
  tags,
  rules,
}: {
  products: PosProduct[];
  branches: BranchOption[];
  tags: TagOption[];
  rules: PosTagRule[];
}) {
  const activeRule = rules[0] ?? null;

  const [products, setProducts] = useState(initialProducts);
  const [ruleId, setRuleId] = useState<string | null>(activeRule?.id ?? null);
  const [filterTagIds, setFilterTagIds] = useState<string[]>(activeRule?.tagIds ?? []);
  const [savingFilter, setSavingFilter] = useState(false);
  const [clearingFilter, setClearingFilter] = useState(false);
  const [tab, setTab] = useState<"allowed" | "not_allowed">("allowed");
  const [error, setError] = useState<string | null>(null);
  const [downloadingBranchId, setDownloadingBranchId] = useState<string | null>(null);

  function toggleFilterTag(tagId: string) {
    setFilterTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  }

  const tagMatched = useMemo(() => {
    if (filterTagIds.length === 0) return [];
    return products.filter((product) => filterTagIds.some((id) => product.tagIds.includes(id)));
  }, [products, filterTagIds]);
  const tagMatchedAllowed = useMemo(() => tagMatched.filter((product) => product.posAllowed).length, [tagMatched]);

  async function saveFilter() {
    if (filterTagIds.length === 0) return;
    setSavingFilter(true);
    setError(null);
    try {
      const result = await savePosTagRule({ id: ruleId, label: "", tagIds: filterTagIds });
      setRuleId(result.id);
      // Fully reconciled server-side: excluded if it matches, allowed if it
      // doesn't — mirror that here rather than only marking the newly
      // matched ones, since a product could have been excluded for reasons
      // that no longer apply once this filter is the only one.
      const matchedIds = new Set(tagMatched.map((product) => product.id));
      setProducts((current) => current.map((product) => ({ ...product, posAllowed: !matchedIds.has(product.id) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this filter.");
    } finally {
      setSavingFilter(false);
    }
  }

  async function clearFilter() {
    if (!ruleId) {
      setFilterTagIds([]);
      return;
    }
    setClearingFilter(true);
    setError(null);
    try {
      await deletePosTagRule(ruleId);
      setRuleId(null);
      setFilterTagIds([]);
      setProducts((current) => current.map((product) => ({ ...product, posAllowed: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear this filter.");
    } finally {
      setClearingFilter(false);
    }
  }

  const allowed = useMemo(() => products.filter((product) => product.posAllowed), [products]);
  const notAllowed = useMemo(() => products.filter((product) => !product.posAllowed), [products]);
  const visible = tab === "allowed" ? allowed : notAllowed;

  const grouped = useMemo(() => {
    const groups = new Map<string, PosProduct[]>();
    for (const product of visible) {
      const key = product.brand || UNBRANDED_LABEL;
      const bucket = groups.get(key);
      if (bucket) bucket.push(product);
      else groups.set(key, [product]);
    }
    const sortedGroups = [...groups.entries()].sort(([left], [right]) => {
      if (left === UNBRANDED_LABEL) return 1;
      if (right === UNBRANDED_LABEL) return -1;
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });
    return sortedGroups.map(([brand, items]) => ({
      brand,
      products: [...items].sort((a, b) =>
        (productDisplayName(a) || a.sku || "").localeCompare(productDisplayName(b) || b.sku || "", undefined, {
          sensitivity: "base",
        }),
      ),
    }));
  }, [visible]);

  // Shown next to each download button so the count on screen matches what
  // the file will contain — same filter as getPosBranchExportRows (allowed,
  // has a SKU, assigned to this salon). Company-wide "Allowed in POS" above
  // is a different, larger number since it isn't scoped to a salon at all.
  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const branch of branches) {
      counts.set(
        branch.id,
        products.filter((product) => product.posAllowed && Boolean(product.sku) && product.branchIds.includes(branch.id))
          .length,
      );
    }
    return counts;
  }, [products, branches]);

  async function downloadBranchList(branch: BranchOption) {
    setDownloadingBranchId(branch.id);
    setError(null);
    try {
      // Re-fetched fresh here rather than filtered from `products` — branch
      // tagging on /admin/branches can change at any point while this page
      // sits open, so the file itself always reads the database directly
      // instead of whatever this tab happened to load with.
      const rows = await getPosBranchExportRows(branch.id);
      downloadCsv(`pos-allowed-${branch.label.toLowerCase().replace(/\s+/g, "-")}.csv`, rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare this download.");
    } finally {
      setDownloadingBranchId(null);
    }
  }

  const filterDirty =
    filterTagIds.length !== (activeRule?.tagIds.length ?? 0) ||
    !filterTagIds.every((id) => activeRule?.tagIds.includes(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted">
          Download the current POS-allowed list for each salon — unique SKUs allowed in POS and assigned to
          that salon. The file is read fresh from the database at download time, so it reflects the latest
          branch tagging even if this page has been open a while — reload the page to refresh the counts
          shown here.
        </p>
        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={btnSecondaryClass}
              onClick={() => void downloadBranchList(branch)}
              disabled={downloadingBranchId === branch.id}
            >
              {downloadingBranchId === branch.id
                ? "Preparing…"
                : `Download ${branch.label} list (${branchCounts.get(branch.id) ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Exclude by tag</h2>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50",
                filterTagIds.includes(tag.id) ? "border-sky-400 bg-sky-100 font-medium" : "border-border",
              )}
              onClick={() => toggleFilterTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>

        <p className="text-sm text-slate-700">
          {filterTagIds.length === 0
            ? "No tags selected — pick at least one to save a filter."
            : `${tagMatched.length} product${tagMatched.length === 1 ? "" : "s"} currently match — ${tagMatchedAllowed} still allowed, ${
                tagMatched.length - tagMatchedAllowed
              } already excluded. Saving excludes exactly these and allows everything else.`}
        </p>

        <div className="flex gap-2">
          <button
            className={btnClass}
            type="button"
            onClick={() => void saveFilter()}
            disabled={savingFilter || filterTagIds.length === 0 || !filterDirty}
          >
            {savingFilter ? "Saving…" : "Save filter"}
          </button>
          {ruleId || filterTagIds.length > 0 ? (
            <button className={btnSecondaryClass} type="button" onClick={() => void clearFilter()} disabled={clearingFilter}>
              {clearingFilter ? "Clearing…" : "Clear filter"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("allowed")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            tab === "allowed" ? "border-slate-900 text-slate-900" : "border-transparent text-muted hover:text-slate-700",
          )}
        >
          Allowed in POS ({allowed.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("not_allowed")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            tab === "not_allowed"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-muted hover:text-slate-700",
          )}
        >
          Not allowed in POS ({notAllowed.length})
        </button>
      </div>

      <div className="max-h-[80vh] overflow-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={cn(thClass, stickyHead)}>Name</th>
              <th className={cn(thClass, stickyHead)}>Size</th>
              <th className={cn(thClass, stickyHead)}>Name with size</th>
              <th className={cn(thClass, stickyHead)}>SKU</th>
              <th className={cn(thClass, stickyHead)}>Brand</th>
              <th className={cn(thClass, stickyHead)}>Type</th>
              <th className={cn(thClass, stickyHead)}>Tag</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr>
                <td className={tdClass} colSpan={7}>
                  {tab === "allowed" ? "No products are allowed in POS yet." : "Every product is allowed in POS."}
                </td>
              </tr>
            ) : (
              grouped.map((group) => (
                <Fragment key={group.brand}>
                  <tr className="bg-slate-50">
                    <td className={cn(tdClass, "font-medium text-slate-700")} colSpan={7}>
                      {group.brand}
                    </td>
                  </tr>
                  {group.products.map((product) => (
                    <tr key={product.id}>
                      <td className={tdClass}>{productDisplayName(product) || product.sku || "—"}</td>
                      <td className={tdClass}>{product.sizeLabel || "—"}</td>
                      <td className={tdClass}>{nameWithSize(product) || "—"}</td>
                      <td className={tdClass}>{product.sku || "—"}</td>
                      <td className={tdClass}>{product.brand || "—"}</td>
                      <td className={tdClass}>{product.typeLabel || "—"}</td>
                      <td className={tdClass}>{product.tagNames.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
