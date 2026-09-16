-- Bugfix: fn_void_inventory_count's "has something later touched this cost"
-- guard checked for a later goods_receipt/surplus-count row without
-- checking whether THAT later row's own effect had since been reversed.
-- Voiding never deletes a row, only appends an offsetting one (same
-- audit-preserving pattern everywhere in this app) — so a later count's
-- original surplus row, or a later receipt's original row, stays in the
-- ledger forever even after it's voided/removed. The guard must only
-- treat a later row as "still live" if its own count is still completed
-- (not voided) / its own receipt is still not voided — otherwise voiding
-- an older count in the correct order (newest first) gets blocked forever
-- by something that's already been undone.
create or replace function fn_void_inventory_count(p_count_id uuid)
returns void language plpgsql as $$
declare
  v_company_id   uuid;
  v_branch_id    uuid;
  v_row          record;
  v_qty_before   numeric;
  v_current_avg  numeric;
  v_old_avg      numeric;
  v_product_name text;
begin
  select company_id, branch_id into v_company_id, v_branch_id
  from inventory_counts where id = p_count_id;

  if v_company_id is null then
    return;
  end if;

  for v_row in
    select it.id, it.product_id, it.store_location_id, it.quantity_change, it.txn_date,
           it.unit_cost, it.reference_id
    from inventory_transactions it
    where it.txn_type = 'count_adjustment'
      and it.reference_table = 'inventory_count_items'
      and it.notes = 'Count variance'
      and it.reference_id in (select id from inventory_count_items where inventory_count_id = p_count_id)
  loop
    -- Only a positive (surplus) adjustment ever blended into product_branch_costs.
    if v_row.quantity_change > 0 then
      select name into v_product_name from products where id = v_row.product_id;

      if exists (
        select 1
        from inventory_transactions later
        join store_locations sl on sl.id = later.store_location_id
        where later.product_id = v_row.product_id
          and sl.branch_id = v_branch_id
          and later.txn_date > v_row.txn_date
          and (
            (
              later.txn_type = 'goods_receipt'
              and later.reference_table = 'goods_receipt_items'
              and exists (
                select 1 from goods_receipt_items gri
                join goods_receipts gr on gr.id = gri.goods_receipt_id
                where gri.id = later.reference_id and gr.voided_at is null
              )
            )
            or (
              later.txn_type = 'count_adjustment'
              and later.quantity_change > 0
              and later.notes = 'Count variance'
              and later.reference_table = 'inventory_count_items'
              and exists (
                select 1 from inventory_count_items ici
                join inventory_counts ic on ic.id = ici.inventory_count_id
                where ici.id = later.reference_id and ic.status = 'completed'
              )
            )
          )
      ) then
        raise exception 'Cannot void: % has had stock costed in since this count — void or remove the newer activity first.', coalesce(v_product_name, 'a product');
      end if;

      select coalesce(sum(quantity_change), 0) into v_qty_before
      from inventory_transactions
      where product_id = v_row.product_id and store_location_id = v_row.store_location_id
        and txn_date < v_row.txn_date;

      select avg_unit_cost into v_current_avg
      from product_branch_costs
      where product_id = v_row.product_id and branch_id = v_branch_id;

      if v_qty_before <= 0 then
        v_old_avg := 0;
      else
        v_old_avg := greatest(
          ((coalesce(v_current_avg, 0) * (v_qty_before + v_row.quantity_change)) - (v_row.quantity_change * coalesce(v_row.unit_cost, 0))) / v_qty_before,
          0
        );
      end if;

      update product_branch_costs
      set avg_unit_cost = v_old_avg, updated_at = now()
      where product_id = v_row.product_id and branch_id = v_branch_id;

      insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost)
      values (v_company_id, v_row.product_id, v_branch_id, v_old_avg);
    end if;

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes
    ) values (
      v_company_id, v_row.product_id, v_row.store_location_id, 'count_adjustment', -v_row.quantity_change,
      'inventory_count_items', v_row.reference_id, 'Voided count'
    );
  end loop;

  update inventory_counts set status = 'voided' where id = p_count_id and status = 'completed';
end;
$$;
comment on function fn_void_inventory_count is 'Reverses a completed count''s ledger quantity exactly, and unwinds any weighted-average-cost blend its surplus lines applied, or raises and rolls back entirely if a later receipt/surplus count that has NOT itself been voided makes an exact unwind impossible.';

notify pgrst, 'reload schema';
