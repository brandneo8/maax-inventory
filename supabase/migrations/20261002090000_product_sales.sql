-- A product sale is one entry of POS sales for a salon on a given date,
-- covering one or more product_sale_items lines. Each line deducts stock as
-- retail_use (the transaction type reserved for genuine POS sales, distinct
-- from Pulse's own stock-out which writes inhouse_use) and records what it
-- sold for, so retail margin can be worked out against its cost.
create table if not exists product_sales (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  branch_id   uuid not null references branches(id),
  sale_date   date not null,
  notes       text,
  keyed_in_by text,
  created_at  timestamptz not null default now()
);
comment on table product_sales is 'One POS product-sales entry for a salon on a date, covering one or more product_sale_items lines.';

create table if not exists product_sale_items (
  id               uuid primary key default gen_random_uuid(),
  product_sale_id  uuid not null references product_sales(id) on delete cascade,
  product_id       uuid not null references products(id),
  quantity         numeric(12,2) not null check (quantity > 0),
  unit_sale_price  numeric(12,2) not null check (unit_sale_price >= 0),
  line_total       numeric(14,2) generated always as (quantity * unit_sale_price) stored,
  created_at       timestamptz not null default now()
);
comment on table product_sale_items is 'One product line on a POS product-sales entry: quantity sold and the per-unit sale price. Its stock deduction is the retail_use inventory_transactions row(s) referencing it.';

alter table product_sales enable row level security;
drop policy if exists product_sales_company_isolation on product_sales;
create policy product_sales_company_isolation on product_sales
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table product_sale_items enable row level security;
drop policy if exists product_sale_items_company_isolation on product_sale_items;
create policy product_sale_items_company_isolation on product_sale_items
  for all using (product_sale_id in (select id from product_sales where company_id in (select fn_my_company_ids())))
  with check (product_sale_id in (select id from product_sales where company_id in (select fn_my_company_ids())));

-- RLS only filters rows; the roles still need base table privileges.
grant select, insert, update, delete on table product_sales to authenticated, service_role;
grant select, insert, update, delete on table product_sale_items to authenticated, service_role;

create index if not exists idx_product_sales_branch on product_sales (branch_id, sale_date desc);
create index if not exists idx_product_sale_items_sale on product_sale_items (product_sale_id);

notify pgrst, 'reload schema';
