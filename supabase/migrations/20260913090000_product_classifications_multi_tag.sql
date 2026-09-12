-- Multi-tag product type. A product can now carry more than one classification
-- (e.g. both retail and inhouse) instead of a single "retail_inhouse" enum value.
create table if not exists product_classifications (
  product_id      uuid not null references products(id) on delete cascade,
  classification  product_classification not null,
  primary key (product_id, classification)
);
comment on table product_classifications is 'Multi-tag product type. products.default_classification and products.available_in_tunai are kept in sync from this table by trigger, for legacy single-value consumers (PO line defaulting, count filter, CSV/report Type column).';

alter table product_classifications enable row level security;
drop policy if exists product_classifications_company_isolation on product_classifications;
create policy product_classifications_company_isolation on product_classifications
  for all using (product_id in (select id from products where company_id in (select fn_my_company_ids())))
  with check (product_id in (select id from products where company_id in (select fn_my_company_ids())));

-- Split any existing 'retail_inhouse' products into two independent tags.
insert into product_classifications (product_id, classification)
select id, 'retail'::product_classification from products where default_classification = 'retail'
union all
select id, 'inhouse'::product_classification from products where default_classification = 'inhouse'
union all
select id, 'gwp'::product_classification from products where default_classification = 'gwp'
union all
select id, 'retail'::product_classification from products where default_classification = 'retail_inhouse'
union all
select id, 'inhouse'::product_classification from products where default_classification = 'retail_inhouse'
on conflict (product_id, classification) do nothing;

-- available_in_tunai can no longer be a generated column since it now depends on
-- another table; replace it with a plain column maintained by trigger below.
alter table products drop column if exists available_in_tunai;
alter table products add column if not exists available_in_tunai boolean not null default false;
comment on column products.available_in_tunai is 'True when product_classifications includes retail or gwp for this product. Maintained by trg_sync_product_classification_summary; do not write to it directly.';

create or replace function fn_sync_product_classification_summary() returns trigger as $$
declare
  pid uuid;
  has_retail boolean;
  has_gwp boolean;
  has_inhouse boolean;
begin
  pid := coalesce(new.product_id, old.product_id);
  select
    bool_or(classification = 'retail'),
    bool_or(classification = 'gwp'),
    bool_or(classification = 'inhouse')
  into has_retail, has_gwp, has_inhouse
  from product_classifications
  where product_id = pid;

  update products
  set
    default_classification = case
      when has_retail then 'retail'::product_classification
      when has_gwp then 'gwp'::product_classification
      when has_inhouse then 'inhouse'::product_classification
      else null
    end,
    available_in_tunai = coalesce(has_retail or has_gwp, false)
  where id = pid;

  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_product_classification_summary on product_classifications;
create trigger trg_sync_product_classification_summary
  after insert or update or delete on product_classifications
  for each row execute function fn_sync_product_classification_summary();

-- Backfill products.default_classification / available_in_tunai from the
-- migrated tags above (covers both tagged and untagged products).
with summary as (
  select
    product_id,
    bool_or(classification = 'retail') as has_retail,
    bool_or(classification = 'gwp') as has_gwp,
    bool_or(classification = 'inhouse') as has_inhouse
  from product_classifications
  group by product_id
)
update products p
set
  default_classification = case
    when s.has_retail then 'retail'::product_classification
    when s.has_gwp then 'gwp'::product_classification
    when s.has_inhouse then 'inhouse'::product_classification
    else null
  end,
  available_in_tunai = coalesce(s.has_retail or s.has_gwp, false)
from summary s
where s.product_id = p.id;

update products
set default_classification = null, available_in_tunai = false
where id not in (select product_id from product_classifications);
