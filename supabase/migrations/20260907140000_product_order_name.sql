-- Rename the catalog title used on orders to order_name, then add an optional
-- recognizable name. Existing product titles stay on order_name.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'order_name'
  ) then
    alter table public.products rename column name to order_name;
  end if;
end $$;

alter table public.products add column if not exists name text;

comment on column public.products.order_name is 'Official product title used on orders and receiving. Required.';
comment on column public.products.name is 'Optional short name staff use to recognize the SKU in the app. Null when unset.';

create or replace view public.low_stock_alerts as
select
  p.id as product_id,
  p.sku,
  coalesce(nullif(btrim(p.name), ''), p.order_name) as name,
  p.low_stock_threshold,
  coalesce(sum(cs.quantity_on_hand), 0) as total_on_hand
from public.products p
left join public.current_stock cs on cs.product_id = p.id
where p.low_stock_threshold is not null
group by p.id, p.sku, p.name, p.order_name, p.low_stock_threshold
having coalesce(sum(cs.quantity_on_hand), 0) <= p.low_stock_threshold;
