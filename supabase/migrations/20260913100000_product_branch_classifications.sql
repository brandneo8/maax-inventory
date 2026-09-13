-- Type tagging becomes per-branch: the same product can be Retail at one
-- salon and In-house at another. product_classifications (company-wide)
-- and products.default_classification / available_in_tunai are left exactly
-- as they are (no data wiped) — they simply stop being written to by the
-- app going forward, superseded by this table for every consumer.
create table if not exists product_branch_classifications (
  product_id      uuid not null references products(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  classification  product_classification not null,
  primary key (product_id, branch_id, classification)
);
comment on table product_branch_classifications is 'Per-branch multi-tag product type. A product can carry different classifications at different branches. Replaces product_classifications (left untouched, historical) as the source of truth for Type going forward.';

alter table product_branch_classifications enable row level security;
drop policy if exists product_branch_classifications_company_isolation on product_branch_classifications;
create policy product_branch_classifications_company_isolation on product_branch_classifications
  for all using (
    product_id in (select id from products where company_id in (select fn_my_company_ids()))
    and branch_id in (select id from branches where company_id in (select fn_my_company_ids()))
  )
  with check (
    product_id in (select id from products where company_id in (select fn_my_company_ids()))
    and branch_id in (select id from branches where company_id in (select fn_my_company_ids()))
  );

grant select, insert, update, delete on public.product_branch_classifications to authenticated;
grant all on public.product_branch_classifications to service_role;

-- Seed: copy each product's current (company-wide) tags onto every branch
-- it is already assigned to, so nothing starts blank.
insert into product_branch_classifications (product_id, branch_id, classification)
select pc.product_id, pb.branch_id, pc.classification
from product_classifications pc
join product_branches pb on pb.product_id = pc.product_id
on conflict (product_id, branch_id, classification) do nothing;

notify pgrst, 'reload schema';
