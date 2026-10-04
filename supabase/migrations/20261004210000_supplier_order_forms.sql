-- Supplier order forms: the CSV / Excel price list a supplier sends for one
-- of its brands, kept as uploaded. One current form per supplier + brand
-- (uploading again replaces it). Files live in a private bucket and are
-- downloaded through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('supplier-order-forms', 'supplier-order-forms', false, 10485760)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create table if not exists supplier_order_forms (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_id   uuid not null references suppliers(id) on delete cascade,
  brand_id      uuid not null references brands(id) on delete cascade,
  file_path     text not null,
  file_name     text not null,
  content_type  text,
  size_bytes    integer,
  uploaded_at   timestamptz not null default now(),
  uploaded_by   text,
  unique (supplier_id, brand_id)
);
comment on table supplier_order_forms is 'The current order form (CSV or Excel, as the supplier sent it) per supplier and brand; the file is in the supplier-order-forms bucket at file_path.';

alter table supplier_order_forms enable row level security;
drop policy if exists supplier_order_forms_company_isolation on supplier_order_forms;
create policy supplier_order_forms_company_isolation on supplier_order_forms
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

grant select, insert, update, delete on supplier_order_forms to authenticated, service_role;

notify pgrst, 'reload schema';
