-- Average monthly usage now also counts count-driven corrections (both
-- shortfalls and surpluses -- magnitude either way) alongside retail/GWP
-- use, matching the same scope getMonthToDateUsage uses in JS. A count
-- moving a SKU's quantity is itself a form of usage/variance worth
-- weighing when deciding how much to reorder -- voided-count reversals
-- are excluded (they're a correction to the ledger, not new usage).
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
    coalesce(sum(abs(it.quantity_change)), 0) / greatest(p_months, 1) as avg_monthly_use
  from inventory_transactions it
  join store_locations sl on sl.id = it.store_location_id
  where sl.branch_id = p_branch_id
    and it.product_id = any(p_product_ids)
    and (
      it.txn_type in ('retail_use', 'gwp_use')
      or (it.txn_type = 'count_adjustment' and it.notes = 'Count variance')
    )
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;

comment on function fn_average_monthly_use(uuid, uuid[], integer) is
  'Average retail/in-house/GWP use plus count-driven corrections (Count variance, both directions) per month over the last p_months complete calendar months (current month excluded) for a branch, one row per product with any activity in that window.';

grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
