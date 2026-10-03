-- A receipt dated before a confirmed count changes that count's "expected"
-- side after the fact, but the count's physical numbers are the truth. So a
-- late receipt writes true-up rows on the first confirmed count after it that
-- counted the product, keeping the counted balance exactly as counted:
--   * up to the count's (unclaimed) surplus: a negative row noted
--     'Count true-up: late receipt (offsets count surplus)' — the extra the
--     count found was this receipt, so that $0 "found" stock is taken back out
--     at its own cost and the receipt's real cost takes its place;
--   * any remainder: a negative 'Count variance' row — the received units
--     must have gone before the count, so they extend its shortfall.
-- Both reference the count item, and trueup_goods_receipt_id ties them to the
-- receipt that caused them (removed with it).
alter table inventory_transactions
  add column if not exists trueup_goods_receipt_id uuid references goods_receipts(id);
comment on column inventory_transactions.trueup_goods_receipt_id is 'Set on count true-up rows written because this receipt is dated before a confirmed count; they''re removed if the receipt is removed or re-dated.';
create index if not exists idx_inventory_transactions_trueup_receipt on inventory_transactions (trueup_goods_receipt_id)
  where trueup_goods_receipt_id is not null;

-- Taking a $0 surplus back out is the exact inverse of the blend that put it
-- in: remove those units at their own cost, so the average returns to what it
-- would have been had the count never found them.
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
    order by it.txn_date asc, it.id asc
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

-- A surplus offset by a late receipt wasn't usage, so it cancels that much of
-- the count variance counted as usage, the same way a product-sale
-- reclassification does.
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
          when it.txn_type = 'count_adjustment'
            and it.notes in ('Reclassified as product sale', 'Count true-up: late receipt (offsets count surplus)')
            then -abs(it.quantity_change)
          else abs(it.quantity_change)
        end
      ),
      0
    ) / greatest(p_months, 1) as avg_monthly_use
  from inventory_transactions_effective it
  join store_locations sl on sl.id = it.store_location_id
  where sl.branch_id = p_branch_id
    and it.product_id = any(p_product_ids)
    and (
      it.txn_type in ('retail_use', 'gwp_use', 'inhouse_use')
      or (
        it.txn_type = 'count_adjustment'
        and it.notes in ('Count variance', 'Reclassified as product sale', 'Count true-up: late receipt (offsets count surplus)')
      )
    )
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;
grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
