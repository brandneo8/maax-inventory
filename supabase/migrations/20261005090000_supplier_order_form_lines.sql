-- Order form lines typed in by hand, for order forms uploaded as a photo
-- (JPG / PNG) instead of a spreadsheet — usually short product lists. They
-- belong to the supplier + brand's current form and stand in for the lines a
-- spreadsheet form would be read into.
create table if not exists supplier_order_form_lines (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  brand_id     uuid not null references brands(id) on delete cascade,
  position     integer not null,
  sku          text not null default '',
  description  text not null,
  size         text not null default '',
  cost         numeric(12, 2),
  rrp          numeric(12, 2),
  updated_at   timestamptz not null default now(),
  updated_by   text
);
comment on table supplier_order_form_lines is 'Lines typed in from a photo order form (JPG/PNG), per supplier and brand, in the order shown on the photo.';

create index if not exists supplier_order_form_lines_supplier_brand_idx
  on supplier_order_form_lines (supplier_id, brand_id, position);

alter table supplier_order_form_lines enable row level security;
drop policy if exists supplier_order_form_lines_company_isolation on supplier_order_form_lines;
create policy supplier_order_form_lines_company_isolation on supplier_order_form_lines
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

grant select, insert, update, delete on supplier_order_form_lines to authenticated, service_role;

notify pgrst, 'reload schema';
