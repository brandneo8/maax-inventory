-- One-time, admin-triggered migration for converting an existing plain
-- product (with real purchase/receiving history) into a bundle. Historical
-- receipts are never rewritten automatically — see fn_after_goods_receipt_item_insert,
-- which only ever reacts to new goods_receipt_items rows. This function lets
-- an admin explicitly move whatever stock/cost the parent SKU is still
-- carrying into its newly-defined components, using the same allocated-cost
-- split the receiving trigger uses going forward. It is safe to call
-- repeatedly: if the parent has no on-hand stock left, it is a no-op.

create or replace function fn_migrate_bundle_stock_to_components(
  p_company_id uuid,
  p_product_id uuid
) returns jsonb language plpgsql as $$
declare
  v_location           record;
  v_component          record;
  v_branch_avg         numeric;
  v_qty                numeric;
  v_value               numeric;
  v_total_allocated     numeric;
  v_credit_qty          numeric;
  v_credit_value        numeric;
  v_credit_cost         numeric;
  v_locations_moved     int := 0;
  v_total_qty_moved     numeric := 0;
  v_total_value_moved   numeric := 0;
begin
  if not exists (
    select 1 from products where id = p_product_id and company_id = p_company_id and is_set = true
  ) then
    raise exception 'Product is not a bundle.';
  end if;

  select coalesce(sum(allocated_cost), 0) into v_total_allocated
  from product_components where set_product_id = p_product_id;

  if v_total_allocated <= 0 then
    raise exception 'This bundle''s components have no cost allocation to migrate against.';
  end if;

  for v_location in
    select sl.id as store_location_id, sl.branch_id, cs.quantity_on_hand
    from current_stock cs
    join store_locations sl on sl.id = cs.store_location_id
    where cs.product_id = p_product_id and cs.quantity_on_hand > 0
  loop
    v_qty := v_location.quantity_on_hand;

    select avg_unit_cost into v_branch_avg
    from product_branch_costs
    where product_id = p_product_id and branch_id = v_location.branch_id;
    v_branch_avg := coalesce(v_branch_avg, 0);

    v_value := v_qty * v_branch_avg;

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change, notes, unit_cost
    ) values (
      p_company_id, p_product_id, v_location.store_location_id, 'count_adjustment', -v_qty,
      'Converted to a bundle — existing stock moved into its components', v_branch_avg
    );

    for v_component in
      select component_product_id, quantity, coalesce(allocated_cost, 0) as allocated_cost
      from product_components
      where set_product_id = p_product_id
    loop
      v_credit_qty := v_qty * v_component.quantity;
      if v_credit_qty <= 0 then
        continue;
      end if;
      v_credit_value := v_value * (v_component.allocated_cost / v_total_allocated);
      v_credit_cost := v_credit_value / v_credit_qty;

      perform fn_apply_goods_receipt_cost(
        p_company_id, v_component.component_product_id, v_location.branch_id,
        v_credit_qty, v_credit_cost
      );

      insert into inventory_transactions (
        company_id, product_id, store_location_id, txn_type, quantity_change, notes, unit_cost
      ) values (
        p_company_id, v_component.component_product_id, v_location.store_location_id, 'count_adjustment', v_credit_qty,
        'Received from converting a bundle''s existing stock', v_credit_cost
      );
    end loop;

    update product_branch_costs
    set avg_unit_cost = 0, updated_at = now()
    where product_id = p_product_id and branch_id = v_location.branch_id;

    v_locations_moved := v_locations_moved + 1;
    v_total_qty_moved := v_total_qty_moved + v_qty;
    v_total_value_moved := v_total_value_moved + v_value;
  end loop;

  return jsonb_build_object(
    'locationsMoved', v_locations_moved,
    'quantityMoved', v_total_qty_moved,
    'valueMoved', v_total_value_moved
  );
end;
$$;
comment on function fn_migrate_bundle_stock_to_components is 'Manual, admin-triggered migration: moves a bundle product''s existing on-hand stock and cost (accrued before it became a bundle) into its components, splitting by each component''s allocated_cost share — the same split the receiving trigger applies going forward. Idempotent: re-running after the parent is already at zero stock does nothing.';

notify pgrst, 'reload schema';
