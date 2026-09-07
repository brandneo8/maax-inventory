insert into public.tags (company_id, name)
select c.id, 'Bundle'
from public.companies c
where c.name = 'MAAX PTE LTD'
on conflict (company_id, name) do nothing;

insert into public.product_tags (product_id, tag_id)
select p.id, t.id
from public.products p
join public.tags t on t.company_id = p.company_id and t.name = 'Bundle'
where p.is_set = true
on conflict do nothing;

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'product_classification'
      and e.enumlabel = 'bundle'
  ) then
    update public.products
      set default_classification = null
      where default_classification = 'bundle';
  end if;
end $$;
