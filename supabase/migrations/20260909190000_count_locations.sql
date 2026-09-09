alter table public.store_locations
  add column if not exists sort_order integer not null default 0;

update public.store_locations
set name = 'Store room'
where name = 'Stock room';

update public.store_locations
set sort_order = case name
  when 'Store room' then 1
  when 'Display shelf' then 2
  when 'Colour bar 1' then 3
  when 'Colour bar 2' then 4
  else sort_order
end;

insert into public.store_locations (branch_id, name, sort_order)
select b.id, loc.name, loc.sort_order
from public.branches b
join public.companies c on c.id = b.company_id
cross join (
  values
    ('Store room', 1),
    ('Display shelf', 2),
    ('Colour bar 1', 3),
    ('Colour bar 2', 4)
) as loc(name, sort_order)
where c.name = 'MAAX PTE LTD'
on conflict (branch_id, name) do update
set sort_order = excluded.sort_order;
