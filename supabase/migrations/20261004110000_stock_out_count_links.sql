-- A stock-out line opened on or before a confirmed count can be marked as
-- already covered by that count's shortfall (the missing units were this
-- in-house use), the same way a product-sale line can. The line records
-- which shortfall row it's assigned to and how much; a +qty count_adjustment
-- noted 'Reclassified as in-house use' (referencing the stock-out line) adds
-- those units back on the count's date, so stock only drops once and the
-- cost moves from count shortfall to in-house use.
alter table retail_use_entries
  add column if not exists linked_count_txn_id uuid references inventory_transactions(id),
  add column if not exists linked_quantity numeric(12,2);
comment on column retail_use_entries.linked_count_txn_id is 'The count-shortfall ledger row (count_adjustment, Count variance, negative) this stock-out line is assigned to, if any.';
comment on column retail_use_entries.linked_quantity is 'Units of this line covered by linked_count_txn_id (the rest is an ordinary deduction). Null when not assigned.';
create index if not exists idx_retail_use_entries_linked_count_txn on retail_use_entries (linked_count_txn_id)
  where linked_count_txn_id is not null;

-- The cost replay restamps the new reclassification rows like product-sale ones.
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
      or (v_row.txn_type = 'count_adjustment' and v_row.notes in ('Reclassified as product sale', 'Reclassified as in-house use'));

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

-- Average monthly use: an in-house reclassification cancels the shortfall it
-- replaces, like a product-sale one.
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
            and it.notes in ('Reclassified as product sale', 'Reclassified as in-house use', 'Count true-up: late receipt (offsets count surplus)')
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
        and it.notes in ('Count variance', 'Reclassified as product sale', 'Reclassified as in-house use', 'Count true-up: late receipt (offsets count surplus)')
      )
    )
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;
grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

notify pgrst, 'reload schema';
