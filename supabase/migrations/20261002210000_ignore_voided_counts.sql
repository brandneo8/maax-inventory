-- A voided count is treated as if it never happened by every calculation
-- that reads the ledger. Its rows stay in inventory_transactions (the
-- "Count variance" lines it posted and the "Voided count" lines that reversed
-- them) as an audit trail, but they no longer affect average cost, usage or
-- the monthly report. Before this, the reversal was a later-dated,
-- quantity-only row, so a voided count's $0 surplus kept diluting the average
-- of any receipt that landed in between.

-- One place that defines "the ledger, minus voided counts". security_invoker
-- so the caller's row-level security still applies through the view.
create or replace view inventory_transactions_effective
with (security_invoker = true) as
select it.*
from inventory_transactions it
where not exists (
  select 1
  from inventory_count_items ici
  join inventory_counts ic on ic.id = ici.inventory_count_id
  where it.reference_table = 'inventory_count_items'
    and ici.id = it.reference_id
    and ic.status = 'voided'
);
comment on view inventory_transactions_effective is 'inventory_transactions without the rows of voided counts (their variance lines and the reversals of them). Use this for any calculation — cost, usage, reports.';

grant select on inventory_transactions_effective to authenticated, service_role;

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
  from inventory_transactions_effective it
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
  'Average retail/in-house/GWP use plus count-driven corrections (Count variance, both directions, net of shortfalls reclassified as product sales, voided counts ignored) per month over the last p_months complete calendar months (current month excluded) for a branch.';
grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

-- fn_void_inventory_count writes its reversal rows before marking the count
-- voided, so the recompute those inserts trigger still sees the count as
-- live. Recompute every product the count touched once the status flips.
create or replace function fn_after_inventory_count_voided()
returns trigger language plpgsql as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select distinct product_id from inventory_count_items where inventory_count_id = new.id
  loop
    perform fn_recompute_branch_cost(new.company_id, v_product_id, new.branch_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_after_inventory_count_voided on inventory_counts;
create trigger trg_after_inventory_count_voided
after update of status on inventory_counts
for each row
when (new.status = 'voided' and old.status is distinct from 'voided')
execute function fn_after_inventory_count_voided();

notify pgrst, 'reload schema';
