-- A product-sale line can be linked to a count shortfall it explains: the
-- count recorded a unit as missing (wastage), when really it was sold.
-- Saving a linked line writes a +qty count_adjustment (note 'Reclassified as
-- product sale', dated at the count) that cancels that much of the
-- shortfall, alongside the usual -qty retail_use — stock on hand is
-- unchanged, the cost just moves from wastage to retail.
alter table product_sale_items
  add column if not exists linked_count_txn_id uuid references inventory_transactions(id);
comment on column product_sale_items.linked_count_txn_id is 'The count-shortfall ledger row (count_adjustment, Count variance, negative) this whole line reclassifies as a product sale, if any.';
create index if not exists idx_product_sale_items_linked_count_txn on product_sale_items (linked_count_txn_id);

-- The reclassification row is re-stamped to the running average like any
-- derived usage, so adding the unit back never moves the average and the
-- row stays exactly value-neutral against the sale row that follows.
create or replace function fn_recompute_branch_cost(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid
) returns void language plpgsql as $$
declare
  v_row  record;
  v_qty  numeric := 0;
  v_avg  numeric := 0;
  v_is_ground_truth_inflow boolean;
  v_is_derived_usage boolean;
begin
  delete from product_branch_cost_history
  where product_id = p_product_id and branch_id = p_branch_id;

  for v_row in
    select it.id, it.txn_type, it.quantity_change, it.unit_cost, it.txn_date, it.notes
    from inventory_transactions it
    join store_locations sl on sl.id = it.store_location_id
    where it.product_id = p_product_id and sl.branch_id = p_branch_id
    order by it.txn_date asc, it.id asc
  loop
    v_is_ground_truth_inflow :=
      v_row.quantity_change > 0
      and (
        v_row.txn_type = 'goods_receipt'
        or (v_row.txn_type = 'count_adjustment' and v_row.notes = 'Count variance')
      );

    v_is_derived_usage :=
      v_row.txn_type in ('retail_use', 'gwp_use', 'inhouse_use')
      or (v_row.txn_type = 'count_adjustment' and v_row.quantity_change < 0 and v_row.notes = 'Count variance')
      or (v_row.txn_type = 'count_adjustment' and v_row.notes = 'Reclassified as product sale');

    if v_is_ground_truth_inflow then
      if v_qty <= 0 then
        v_avg := coalesce(v_row.unit_cost, 0);
      else
        v_avg := ((v_qty * v_avg) + (v_row.quantity_change * coalesce(v_row.unit_cost, 0))) / (v_qty + v_row.quantity_change);
      end if;
      v_qty := v_qty + v_row.quantity_change;

      insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost, effective_at)
      values (p_company_id, p_product_id, p_branch_id, v_avg, v_row.txn_date);
    else
      if v_is_derived_usage and v_row.unit_cost is distinct from v_avg then
        update inventory_transactions set unit_cost = v_avg where id = v_row.id;
      end if;
      v_qty := v_qty + v_row.quantity_change;
    end if;
  end loop;

  insert into product_branch_costs (company_id, product_id, branch_id, avg_unit_cost)
  values (p_company_id, p_product_id, p_branch_id, v_avg)
  on conflict (product_id, branch_id) do update set avg_unit_cost = excluded.avg_unit_cost, updated_at = now();
end;
$$;
comment on function fn_recompute_branch_cost is 'Rebuilds one product+branch''s weighted-average cost and history from its full inventory_transactions history, in business-date order. Idempotent — safe to call any time something about that history changes.';

-- A reclassified unit is counted once as usage (the sale), not twice (the
-- original shortfall plus the sale), so the reclassification row offsets the
-- shortfall it cancels.
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
    coalesce(
      sum(
        case
          when it.txn_type = 'count_adjustment' and it.notes = 'Reclassified as product sale' then -abs(it.quantity_change)
          else abs(it.quantity_change)
        end
      ),
      0
    ) / greatest(p_months, 1) as avg_monthly_use
  from inventory_transactions it
  join store_locations sl on sl.id = it.store_location_id
  where sl.branch_id = p_branch_id
    and it.product_id = any(p_product_ids)
    and (
      it.txn_type in ('retail_use', 'gwp_use', 'inhouse_use')
      or (it.txn_type = 'count_adjustment' and it.notes in ('Count variance', 'Reclassified as product sale'))
    )
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;

comment on function fn_average_monthly_use(uuid, uuid[], integer) is
  'Average retail/in-house/GWP use plus count-driven corrections (Count variance, both directions, net of shortfalls reclassified as product sales) per month over the last p_months complete calendar months (current month excluded) for a branch, one row per product with any activity in that window.';

grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
