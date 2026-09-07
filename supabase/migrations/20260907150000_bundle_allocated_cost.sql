alter table public.product_components
  add column if not exists allocated_cost numeric(12, 2);

comment on column public.product_components.allocated_cost is
  'Share of the parent bundle unit cost for this component line (one parent). Child unit cost is allocated_cost / quantity.';
