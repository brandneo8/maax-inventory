-- The reverse of a late receipt: removing a receipt that a confirmed count
-- had already included in its expected quantities. The count measured the
-- shelf without those units, so its shortfall already took them off; the
-- reversal would take them off again. A +qty row noted
-- 'Count true-up: removed receipt (offsets count shortfall)' gives back up to
-- the count's (unclaimed) shortfall on the count's date — handled like a
-- product-sale reclassification: restamped at the average, cancelling that
-- much shortfall in usage figures. Anything beyond the shortfall is a
-- surplus the count really found (a +'Count variance' row). Both carry
-- trueup_goods_receipt_id = the removed receipt.

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
      or (v_row.txn_type = 'count_adjustment' and v_row.notes in ('Reclassified as product sale', 'Reclassified as in-house use', 'Count true-up: removed receipt (offsets count shortfall)'));

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
          when it.txn_type = 'count_adjustment'
            and it.notes in ('Reclassified as product sale', 'Reclassified as in-house use', 'Count true-up: late receipt (offsets count surplus)', 'Count true-up: removed receipt (offsets count shortfall)')
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
        and it.notes in ('Count variance', 'Reclassified as product sale', 'Reclassified as in-house use', 'Count true-up: late receipt (offsets count surplus)', 'Count true-up: removed receipt (offsets count shortfall)')
      )
    )
    and it.txn_date >= date_trunc('month', now() at time zone 'Asia/Singapore') - (greatest(p_months, 1) || ' months')::interval
    and it.txn_date < date_trunc('month', now() at time zone 'Asia/Singapore')
  group by it.product_id;
$$;
grant execute on function fn_average_monthly_use(uuid, uuid[], integer) to authenticated, service_role;

-- A voided (cancelled) order can't take a receipt: voiding removes its
-- receipts, and nothing may be received into it afterwards.
create or replace function fn_block_receipt_on_cancelled_po()
returns trigger language plpgsql as $$
begin
  if new.purchase_order_id is not null and exists (
    select 1 from purchase_orders po where po.id = new.purchase_order_id and po.status = 'cancelled'
  ) then
    raise exception 'This order is voided, so stock can''t be received into it. Duplicate it into a new order instead.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_block_receipt_on_cancelled_po on goods_receipts;
create trigger trg_block_receipt_on_cancelled_po
before insert on goods_receipts
for each row execute function fn_block_receipt_on_cancelled_po();

notify pgrst, 'reload schema';
