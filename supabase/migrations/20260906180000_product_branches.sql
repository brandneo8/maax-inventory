-- Admin assigns which salon catalogs a product appears in.
create table if not exists public.product_branches (
  product_id  uuid not null references public.products (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  primary key (product_id, branch_id)
);

comment on table public.product_branches is 'Which branches show this product on /products. Ticked by admin on the catalog table.';

grant select, insert, update, delete on public.product_branches to authenticated;
grant all on public.product_branches to service_role;

alter table public.product_branches enable row level security;
drop policy if exists product_branches_company_isolation on public.product_branches;
create policy product_branches_company_isolation on public.product_branches
  for all
  using (
    product_id in (select id from public.products where company_id in (select public.fn_my_company_ids()))
  )
  with check (
    product_id in (select id from public.products where company_id in (select public.fn_my_company_ids()))
    and branch_id in (select id from public.branches where company_id in (select public.fn_my_company_ids()))
  );

create index if not exists idx_product_branches_branch on public.product_branches (branch_id);

-- Existing catalog stays visible at both salons until admin unchecks a branch.
insert into public.product_branches (product_id, branch_id)
select p.id, b.id
from public.products p
join public.branches b on b.company_id = p.company_id
on conflict do nothing;
