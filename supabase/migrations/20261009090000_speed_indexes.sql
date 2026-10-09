-- Indexes for the queries behind Home, /orders, /stock-in and /stock-out.
-- Indexes only: no table, column or row changes.

-- Ledger reads by location and date range (monthly report, month-to-date use,
-- average monthly use, count shortfalls).
create index if not exists idx_inventory_txn_location_date
  on inventory_transactions (store_location_id, txn_date);

-- Ledger rows looked up by what they belong to (stock-out lines, sales,
-- receipts, true-ups).
create index if not exists idx_inventory_txn_reference
  on inventory_transactions (reference_table, reference_id);

-- Purchase order lists and details embed their receipts.
create index if not exists idx_goods_receipts_po
  on goods_receipts (purchase_order_id);
create index if not exists idx_goods_receipt_items_receipt
  on goods_receipt_items (goods_receipt_id);

-- The catalog embeds each product's suppliers (the unique index leads with supplier_id).
create index if not exists idx_supplier_products_product
  on supplier_products (product_id);

-- Purchase order lists per branch, newest first.
create index if not exists idx_purchase_orders_branch_created
  on purchase_orders (company_id, branch_id, planning_only, created_at desc);

-- Active-count checks before saving receipts, sales and stock-outs.
create index if not exists idx_inventory_counts_branch_status
  on inventory_counts (branch_id, status);

-- Branch average costs (the unique index leads with product_id).
create index if not exists idx_product_branch_costs_branch
  on product_branch_costs (branch_id);
