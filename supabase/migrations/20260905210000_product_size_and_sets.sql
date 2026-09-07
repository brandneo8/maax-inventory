alter table public.products
  add column if not exists size_label text,
  add column if not exists size_ml numeric(12, 3),
  add column if not exists is_set boolean not null default false;

comment on column public.products.size_label is 'Display size as entered, e.g. 175 ml or 1 L.';
comment on column public.products.size_ml is 'Canonical size in millilitres. Grams are treated as 1 g = 1 ml for matching.';
comment on column public.products.is_set is 'True when this SKU is a bundle of other products. Components live in product_components.';

create table if not exists public.product_components (
  set_product_id        uuid not null references public.products (id) on delete cascade,
  component_product_id  uuid not null references public.products (id) on delete restrict,
  quantity              numeric(12, 3) not null default 1,
  primary key (set_product_id, component_product_id),
  check (set_product_id <> component_product_id),
  check (quantity > 0)
);

comment on table public.product_components is 'Bill of materials for set/bundle SKUs. One row per component in the set.';

grant select, insert, update, delete on public.product_components to authenticated;
grant all on public.product_components to service_role;

alter table public.product_components enable row level security;
create policy product_components_company_isolation on public.product_components
  for all
  using (
    set_product_id in (select id from public.products where company_id in (select public.fn_my_company_ids()))
  )
  with check (
    set_product_id in (select id from public.products where company_id in (select public.fn_my_company_ids()))
    and component_product_id in (select id from public.products where company_id in (select public.fn_my_company_ids()))
  );
