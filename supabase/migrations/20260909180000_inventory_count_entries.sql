create table if not exists public.inventory_count_entries (
  id                       uuid primary key default gen_random_uuid(),
  inventory_count_id       uuid not null references public.inventory_counts(id) on delete cascade,
  inventory_count_item_id  uuid not null references public.inventory_count_items(id) on delete cascade,
  quantity_delta           numeric(12, 2) not null,
  created_at               timestamptz not null default now(),
  created_by               text
);

comment on table public.inventory_count_entries is
  'Additive count scans. counted_quantity on inventory_count_items is the running total of these deltas.';

create index if not exists idx_inventory_count_entries_count_created
  on public.inventory_count_entries (inventory_count_id, created_at desc);

alter table public.inventory_count_entries enable row level security;

drop policy if exists inventory_count_entries_company_isolation on public.inventory_count_entries;
create policy inventory_count_entries_company_isolation on public.inventory_count_entries
  for all using (
    inventory_count_id in (
      select id from public.inventory_counts where company_id in (select public.fn_my_company_ids())
    )
  )
  with check (
    inventory_count_id in (
      select id from public.inventory_counts where company_id in (select public.fn_my_company_ids())
    )
  );

grant select, insert, update, delete on public.inventory_count_entries to authenticated;
grant all on public.inventory_count_entries to service_role;

insert into public.inventory_count_entries (
  inventory_count_id,
  inventory_count_item_id,
  quantity_delta,
  created_by
)
select
  items.inventory_count_id,
  items.id,
  items.counted_quantity,
  counts.counted_by
from public.inventory_count_items items
join public.inventory_counts counts on counts.id = items.inventory_count_id
where items.counted_quantity is not null
  and not exists (
    select 1
    from public.inventory_count_entries entries
    where entries.inventory_count_item_id = items.id
  );
