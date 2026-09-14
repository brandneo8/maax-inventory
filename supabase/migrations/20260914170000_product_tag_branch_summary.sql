-- Reporting view for the "service tagging" feature (product_tags/tags):
-- unique SKU counts per branch, crossed by tag and by Type. Powers reports
-- like "how many in-house shampoo SKUs do we carry at Min" without every
-- caller re-deriving this join. Matches the existing views in this file
-- (current_stock, low_stock_alerts) in not enforcing RLS itself -- callers
-- filter by company_id, same as those.

create or replace view product_tag_branch_summary as
select
  p.company_id,
  pb.branch_id,
  t.id as tag_id,
  t.name as tag_name,
  pbc.classification,
  count(distinct p.id) as sku_count
from products p
join product_branches pb on pb.product_id = p.id
join product_tags pt on pt.product_id = p.id
join tags t on t.id = pt.tag_id
left join product_branch_classifications pbc
  on pbc.product_id = p.id and pbc.branch_id = pb.branch_id
where p.is_active = true
group by p.company_id, pb.branch_id, t.id, t.name, pbc.classification;
comment on view product_tag_branch_summary is 'Unique SKU counts per branch, crossed by service tag (product_tags/tags) and Type (product_branch_classifications). classification is null for untyped SKUs on that branch. Powers reporting such as "how many in-house shampoo SKUs do we carry".';

notify pgrst, 'reload schema';
