-- Allow catalog rows without a SKU. Empty strings become NULL so the existing
-- unique (company_id, sku) constraint can hold many blank SKUs (Postgres
-- treats NULLs as distinct).
alter table public.products
  alter column sku drop not null;

update public.products
set sku = null
where sku is not null and btrim(sku) = '';

alter table public.products
  drop constraint if exists products_sku_nonempty;

alter table public.products
  add constraint products_sku_nonempty
  check (sku is null or length(btrim(sku)) > 0);

comment on column public.products.sku is 'Optional. Unique per company when present. Blank SKUs are stored as NULL.';

alter table public.products
  add column if not exists barcode text;

update public.products
set barcode = null
where barcode is not null and btrim(barcode) = '';

alter table public.products
  drop constraint if exists products_barcode_nonempty;

alter table public.products
  add constraint products_barcode_nonempty
  check (barcode is null or length(btrim(barcode)) > 0);

create unique index if not exists products_company_id_barcode_key
  on public.products (company_id, barcode)
  where barcode is not null;

comment on column public.products.barcode is 'Optional. Unique per company when present. Blank barcodes are stored as NULL. MYR cost columns are not stored.';
