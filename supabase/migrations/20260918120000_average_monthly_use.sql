-- Average monthly usage per product, for comparing against month-to-date
-- use on the Orders > Inventory Balance page. Computed as a single
-- server-side aggregate (sum + group by) over the trailing p_months FULL
-- calendar months (excluding the current, still in-progress month) rather
-- than pulling every matching row to the client and summing in JS — the
-- app already does one row-per-transaction fetch for month-to-date use,
-- which is fine at that scale (one month), but doing the same for a
-- multi-month trailing window would multiply the row count for no benefit
-- once all we want back is one number per product.
create or replace function fn_average_monthly_use(
  p_branch_id uuid,
  p_product_ids uuid[],
  p_months integer default 3
)
returns table (product_id uuid, avg_monthly_use numeric)
language sql
stable
as $$
  select
    it.product_id,
    coalesce(sum(-it.quantity_change), 0) / greatest(p_months, 1) as avg_monthly_use
  from inventory_transactions it
  join store_locations sl on sl.id = it.store_location_id
  where sl.branch_id = p_branch_id
    and it.product_id = any(p_product_ids)
    and it.txn_type in ('retail_use', 'gwp_use')
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;

comment on function fn_average_monthly_use(uuid, uuid[], integer) is
  'Average retail/GWP use per month over the last p_months complete calendar months (current month excluded) for a branch, one row per product with any usage in that window.';

grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
