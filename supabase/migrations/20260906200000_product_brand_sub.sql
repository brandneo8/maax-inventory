alter table public.products
  add column if not exists brand_sub text;

comment on column public.products.brand_sub is 'Product line under a brand, e.g. Ordeve or Dia Light. Used to group the catalog for inspection.';

create index if not exists idx_products_company_brand_sub
  on public.products (company_id, brand_sub);
