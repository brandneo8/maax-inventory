-- Salon-level counts: location is a scan remark, not a second key on count items.

alter table public.inventory_count_entries
  add column if not exists store_location_id uuid references public.store_locations(id) on delete set null;

comment on column public.inventory_count_entries.store_location_id is
  'Optional room where this scan was found. Does not split on-hand or count lines.';

update public.inventory_count_entries e
set store_location_id = i.store_location_id
from public.inventory_count_items i
where e.inventory_count_item_id = i.id
  and e.store_location_id is null
  and i.store_location_id is not null;

alter table public.inventory_count_items
  alter column store_location_id drop not null;

create temporary table count_item_keepers on commit drop as
select distinct on (inventory_count_id, product_id)
  id as keeper_id,
  inventory_count_id,
  product_id
from public.inventory_count_items
order by inventory_count_id, product_id, id;

update public.inventory_count_entries e
set inventory_count_item_id = k.keeper_id
from public.inventory_count_items i
join count_item_keepers k
  on k.inventory_count_id = i.inventory_count_id
 and k.product_id = i.product_id
where e.inventory_count_item_id = i.id
  and e.inventory_count_item_id <> k.keeper_id;

update public.inventory_count_items keeper
set
  expected_quantity = s.expected_quantity,
  counted_quantity = s.counted_quantity,
  store_location_id = null
from (
  select
    k.keeper_id,
    sum(coalesce(i.expected_quantity, 0)) as expected_quantity,
    sum(i.counted_quantity) as counted_quantity
  from count_item_keepers k
  join public.inventory_count_items i
    on i.inventory_count_id = k.inventory_count_id
   and i.product_id = k.product_id
  group by k.keeper_id
) s
where keeper.id = s.keeper_id;

delete from public.inventory_count_items i
using count_item_keepers k
where i.inventory_count_id = k.inventory_count_id
  and i.product_id = k.product_id
  and i.id <> k.keeper_id;

update public.inventory_count_items
set store_location_id = null
where store_location_id is not null;

create unique index if not exists inventory_count_items_count_id_product_id_key
  on public.inventory_count_items (inventory_count_id, product_id);

comment on column public.inventory_count_items.store_location_id is
  'Unused for uniqueness. Count lines are one row per product; room notes live on entries.';
