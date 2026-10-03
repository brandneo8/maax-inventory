-- Late-receipt true-up rows are written at their count's exact timestamp, and
-- the cost replay broke same-timestamp ties by row id (random) — so a surplus
-- offset could replay before the surplus it offsets and zero the average
-- (seen on 1126 Shampoo Lenitivo 1000ml at Min). Ties now replay the count's
-- own variance first, then the offset, then any extra shortfall.

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
    from inventory_transactions_effective it
    join store_locations sl on sl.id = it.store_location_id
    where it.product_id = p_product_id and sl.branch_id = p_branch_id
    order by
      it.txn_date asc,
      -- True-up rows share their count's timestamp: the count's own variance
      -- first, then the surplus offset, then any extra shortfall.
      case
        when it.notes = 'Count true-up: late receipt (offsets count surplus)' then 1
        when it.trueup_goods_receipt_id is not null then 2
        else 0
      end asc,
      it.id asc
  loop
    if v_row.txn_type = 'count_adjustment' and v_row.notes = 'Count true-up: late receipt (offsets count surplus)' then
      if v_qty > 0 and v_qty + v_row.quantity_change > 0 then
        v_avg := ((v_qty * v_avg) + (v_row.quantity_change * coalesce(v_row.unit_cost, 0))) / (v_qty + v_row.quantity_change);
      end if;
      v_qty := v_qty + v_row.quantity_change;
      insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost, effective_at)
      values (p_company_id, p_product_id, p_branch_id, v_avg, v_row.txn_date);
      continue;
    end if;

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
comment on function fn_recompute_branch_cost is 'Rebuilds one product+branch''s weighted-average cost and history from its full ledger in business-date order, ignoring voided counts. Idempotent — safe to call any time something about that history changes.';

-- Replay every product+branch that has true-up rows.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct it.company_id, it.product_id, sl.branch_id
    from inventory_transactions it
    join store_locations sl on sl.id = it.store_location_id
    where it.trueup_goods_receipt_id is not null
  loop
    perform fn_recompute_branch_cost(v_pair.company_id, v_pair.product_id, v_pair.branch_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
