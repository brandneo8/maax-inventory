-- Confirmed retail price: use supplier RRP when it is above 0, otherwise 2 × unit cost.
-- Generated column — existing rows keep their data; only a new computed column is added.
alter table public.products
  add column if not exists crp numeric(12, 2)
  generated always as (
    case
      when rrp is not null and rrp > 0 then rrp
      else unit_cost_price * 2
    end
  ) stored;

comment on column public.products.crp is
  'Confirmed retail price. Uses RRP when RRP > 0, otherwise unit_cost_price × 2.';
