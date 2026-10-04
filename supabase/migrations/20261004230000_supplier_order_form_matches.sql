-- Manual matches between an order form's lines and Pulse products, set on a
-- supplier's price list when the automatic SKU / name matching is wrong (e.g.
-- the supplier's form repeats a SKU). A line is identified by line_key (its
-- SKU and description, normalised), so matches survive re-uploading the same
-- form. product_id null means "this line is not on Pulse".
create table if not exists supplier_order_form_matches (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  brand_id     uuid not null references brands(id) on delete cascade,
  line_key     text not null,
  product_id   uuid references products(id) on delete cascade,
  matched_at   timestamptz not null default now(),
  matched_by   text,
  unique (supplier_id, brand_id, line_key)
);
comment on table supplier_order_form_matches is 'Manual order form line to product matches per supplier and brand; product_id null = the line has no Pulse product.';

alter table supplier_order_form_matches enable row level security;
drop policy if exists supplier_order_form_matches_company_isolation on supplier_order_form_matches;
create policy supplier_order_form_matches_company_isolation on supplier_order_form_matches
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

grant select, insert, update, delete on supplier_order_form_matches to authenticated, service_role;

notify pgrst, 'reload schema';
