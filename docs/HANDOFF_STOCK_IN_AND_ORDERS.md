# Handoff: Stock-in rename + new Orders workspace

**Repo:** `c:\Users\USER\Projects\maax-inventory\maax-inventory`  
**Remote:** `https://github.com/brandneo8/maax-inventory`  
**Branch:** `main` (check `git status` — work may be uncommitted)  
**Date:** 2026-09-18  
**For:** next Cursor agent implementing this feature

---

## Goal (what the user asked for)

1. **Rename today’s purchase-order UI** from “Orders” → **Stock-in**, including the URL path.
2. **Free up `/orders`** and build a **new Orders page** that is a replenishment workspace (not a second receive flow).

New `/orders` has **two tabs**:

| Tab | Purpose |
|---|---|
| **Inventory Balance** | See salon stock + build an order side-by-side |
| **Orders** | List POs already created for this salon (links open in Stock-in) |

### Inventory Balance layout

- One section, two panes:
  - **~60% width:** inventory table (products on this salon)
  - **~40% width:** **Create order** form/table
- Filters on inventory: **brand**, **tag**, **type** (per-branch Type: Retail / In-house / GWP)
- Also include search by salon use name / SKU / barcode (same idea as stock-out picker)

### Create order table columns (user-specified)

1. **Name** — salon use name (`products.name`, fallback `order_name`) via `productDisplayName`
2. **Cost price with tax** — unit cost + GST when supplier is GST-registered (`catalogTax` in `src/lib/catalog-pricing.ts`)
3. **Quantity on hand** — this salon’s on-hand from `current_stock`
4. **Quantity to order** — editable integer
5. **Total price** — qty × cost with tax

### Save behaviour (confirmed in planning)

- **Save order** creates a normal draft `purchase_orders` row (same data model as today).
- After save → redirect to `/stock-in/[id]` (or stay on Orders tab with link to Stock-in).
- Stock still does **not** move until Stock-in **receive**.
- One supplier per order (same as current PO form).
- Qty 0 lines dropped on save; empty order cannot save.
- Click inventory row / Add → append to create-order table (no duplicate lines for same product).

### Not in scope

- No new DB tables for “orders” vs “stock-in” — both are `purchase_orders`.
- Do not drop/truncate catalog or `product_components`.
- Do not `supabase db reset` or apply `supabase/schema.sql` to remote.
- Stock-out stays at `/stock-out`.

---

## Current state (partial work already started)

Someone already **copied** the old orders app into `src/app/(app)/stock-in/` and started rewiring links/revalidatePaths. Sidebar already shows **both** Orders and Stock-in.

### Done / in progress

- [x] `src/app/(app)/stock-in/**` exists (clone of former orders UI)
- [x] Stock-in list page title says “Stock-in” / “New stock-in”
- [x] Sidebar: `/orders` (Orders) + `/stock-in` (Stock-in)
- [x] Some `revalidatePath` / movement links updated toward `/stock-in`
- [ ] **`src/app/(app)/orders/**` still contains the OLD purchase-order UI** (duplicate of stock-in). It must be replaced with the new workspace, then old PO files under `/orders` deleted.
- [ ] Redirects from old deep links (`/orders/[id]`, `/orders/[id]/receive`) → `/stock-in/...`
- [ ] New Inventory Balance + Create order UI not built yet
- [ ] Full grep cleanup: any remaining `/orders` that mean POs must become `/stock-in`

### Likely dirty files to inspect first

```
src/app/(app)/stock-in/          # new (untracked or copied)
src/app/(app)/orders/            # still old PO UI — must change
src/components/app-sidebar.tsx
src/app/(app)/branch-actions.ts
src/app/(app)/products/actions.ts
src/app/(app)/suppliers/actions.ts
src/app/(app)/admin/catalog-bulk/route.ts
src/app/(app)/admin/supplier-gst/route.ts
src/lib/data/movements.ts
next.config.ts                   # may already have redirects — check
```

Run `git status` and `git diff` before editing so you don’t clobber parallel work.

---

## Implementation plan for the next agent

### Phase A — Finish Stock-in rename

1. Treat `src/app/(app)/stock-in/` as the **only** PO app (list, new, detail, receive, void, duplicate).
2. Grep the whole repo for `"/orders"` / `` `/orders` `` and update every path that refers to purchase orders → `/stock-in`.
3. Keep shared data helpers in `src/lib/data/orders.ts` (name can stay; it’s the PO data layer).
4. Add Next.js redirects (prefer `next.config.ts` redirects):
   - `/orders/:id` → `/stock-in/:id` (only if `:id` is a UUID — careful: don’t break the new `/orders` page)
   - `/orders/:id/receive` → `/stock-in/:id/receive`
   - Optional: `/orders/new` → could land on new Orders Inventory Balance tab instead of old form
5. Delete obsolete PO UI under `src/app/(app)/orders/` **after** the new page exists (or delete PO-only files and replace `page.tsx`).

### Phase B — Build new `/orders` workspace

Replace `src/app/(app)/orders/page.tsx` with a client/server split roughly like:

- Server page: load branch catalog products, on-hand qty, brands/tags/types, suppliers, GST rate, existing POs for “Orders” tab.
- Client shell: two tabs — `Inventory Balance` | `Orders`.

**Inventory pane (~60%)**

- Table of salon products (`product_branches` for current branch).
- Columns suggestion: name (salon use), brand, type, on-hand (+ Add).
- Filters: brand, tag, type.
- Search: name / SKU / barcode (reuse `searchFieldsMatch` from `src/lib/search.ts`; product picker already improved for stock-out).

**Create order pane (~40%)**

- Supplier select (required).
- Table columns exactly as user specified.
- Cost with tax: `catalogTax(unitCost, supplier.gstRegistered, gstRate).unitCostWithTax`.
- On-hand: reuse patterns from `getBranchOnHand` / Tunai (`src/lib/data/products.ts`, `src/lib/data/stock.ts`).
- Save → call existing `createPurchaseOrder` (move/adapt from stock-in actions) with lines mapped to `product_id` + `quantity_ordered` + `unit_price` (store **pre-tax** unit cost in DB the same way today’s PO form does — confirm in `stock-in/actions.ts` / old `orders/actions.ts`).

**Orders tab**

- Reuse stock-in list table component or thin wrapper; links go to `/stock-in/[id]`.
- Do **not** reimplement receive here.

### Phase C — Polish

- Sidebar order suggestion: Home, Movements, **Orders**, **Stock-in**, Stock-out, Counts, Reports, Admin.
- Branch cookie revalidation includes both `/orders` and `/stock-in` (already started in `branch-actions.ts`).
- Copy: don’t say “Purchase orders” on the new Orders page; Stock-in owns that language.

---

## Key files & helpers

| Area | Path |
|---|---|
| Sidebar | `src/components/app-sidebar.tsx` |
| PO actions (after rename) | `src/app/(app)/stock-in/actions.ts` |
| PO data | `src/lib/data/orders.ts` |
| Product options / on-hand | `src/lib/data/products.ts` (`getOrderProductOptions`, `getBranchOnHand`, `getTunaiProducts`) |
| Stock qty | `src/lib/data/stock.ts`, view `current_stock` |
| Tax helper | `src/lib/catalog-pricing.ts` → `catalogTax` |
| Display name | `src/lib/format.ts` → `productDisplayName` |
| Search tokens | `src/lib/search.ts` → `searchFieldsMatch` |
| Product picker | `src/components/product-picker.tsx` (barcode/SKU/name search already fixed for stock-out) |
| Per-branch Type | `product_branch_classifications` |

---

## Live Supabase rules (must follow)

Linked project `tfetufbblqvjutzonyte` is live MAAX data.

- Schema: `bun run db:push` only (additive migrations).
- Never `supabase db reset` / never apply `supabase/schema.sql` to remote.
- Never drop/truncate catalog or `product_components`.
- This feature should **not** need a migration if it only reuses `purchase_orders`.

Also read: `AGENTS.md`, `.cursor/rules/supabase-data.mdc`.

---

## Related recent context (same chat thread)

- Stock-out search fixed: pass salon use name + SKU + barcode into picker; tokenized `searchFieldsMatch`.
- Files: `src/components/product-picker.tsx`, `src/lib/search.ts`, `src/app/(app)/stock-out/product-option.ts`, stock-out pages.
- That work may or may not be committed — check status before assuming.

---

## Acceptance checklist

- [ ] Sidebar: **Orders** → `/orders`, **Stock-in** → `/stock-in`
- [ ] Creating/receiving POs only lives under `/stock-in`
- [ ] Old `/orders/[uuid]` bookmarks redirect to Stock-in without breaking new `/orders`
- [ ] `/orders` Inventory Balance: 60/40 layout, filters brand/tag/type, create-order columns as specified
- [ ] Save creates a draft PO and is visible under Stock-in + Orders tab
- [ ] Receive still only on Stock-in detail/receive pages
- [ ] No live data loss / no destructive migrations

---

## Open questions (ask user only if blocked)

1. After Save on Inventory Balance, prefer redirect to `/stock-in/[id]` or stay on `/orders` Orders tab?
2. Should Create order use **catalog unit cost** or **branch avg cost** as the editable default (today’s PO form supports avg-cost apply)?
3. Inventory list: all salon products, or hide zero-stock / inactive?

Default if user unreachable: redirect to `/stock-in/[id]`; default unit price = catalog unit cost (pre-tax); show all active salon-assigned products.
