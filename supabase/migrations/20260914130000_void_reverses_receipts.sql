-- Voiding a received purchase order now reverses the stock and weighted-
-- average cost impact of its receipts, but only when doing so is still
-- exact: no later receipt has blended cost for the same product+branch
-- since, and enough of the received stock is still on hand to remove. If
-- either condition fails for any line, the whole void is aborted (nothing
-- partially reverses) with a message explaining why.

alter table goods_receipts add column if not exists voided_at timestamptz;
comment on column goods_receipts.voided_at is 'Set when this receipt''s stock/cost effects were reversed by voiding its purchase order. Null = still in effect.';

-- Reverses one goods_receipt's ledger and cost-blend effects in place.
-- Blending is associative, so every line this receipt touched for a given
-- product is folded into a single combined (quantity, weighted cost) before
-- being unwound — the result is exact regardless of how many lines/bundle
-- components within this one receipt affected that product.
create or replace function fn_reverse_goods_receipt(p_goods_receipt_id uuid)
returns void language plpgsql as $$
declare
  v_company_id   uuid;
  v_branch_id    uuid;
  v_voided_at    timestamptz;
  v_row          record;
  v_product_name text;
  v_qty_before   numeric;
  v_current_avg  numeric;
  v_old_avg      numeric;
  v_on_hand      numeric;
begin
  select company_id, branch_id, voided_at
    into v_company_id, v_branch_id, v_voided_at
  from goods_receipts
  where id = p_goods_receipt_id;

  if v_company_id is null or v_voided_at is not null then
    return;
  end if;

  for v_row in
    select
      it.product_id,
      it.store_location_id,
      sum(it.quantity_change) as total_qty,
      sum(it.quantity_change * coalesce(it.unit_cost, 0)) / nullif(sum(it.quantity_change), 0) as weighted_cost,
      max(it.txn_date) as txn_date,
      (array_agg(it.reference_id))[1] as sample_reference_id
    from inventory_transactions it
    where it.reference_table = 'goods_receipt_items'
      and it.reference_id in (select id from goods_receipt_items where goods_receipt_id = p_goods_receipt_id)
      and it.txn_type = 'goods_receipt'
    group by it.product_id, it.store_location_id
  loop
    select name into v_product_name from products where id = v_row.product_id;

    if exists (
      select 1
      from inventory_transactions later
      join store_locations sl on sl.id = later.store_location_id
      where later.product_id = v_row.product_id
        and sl.branch_id = v_branch_id
        and later.txn_type = 'goods_receipt'
        and later.txn_date > v_row.txn_date
        and not (
          later.reference_table = 'goods_receipt_items'
          and later.reference_id in (select id from goods_receipt_items where goods_receipt_id = p_goods_receipt_id)
        )
    ) then
      raise exception 'Cannot void: % has been received again since this order — void the newer receipt first.', coalesce(v_product_name, 'a product');
    end if;

    select coalesce(sum(quantity_change), 0) into v_on_hand
    from inventory_transactions
    where product_id = v_row.product_id and store_location_id = v_row.store_location_id;

    if v_on_hand < v_row.total_qty then
      raise exception 'Cannot void: some of the % received here has already been used or sold.', coalesce(v_product_name, 'stock');
    end if;

    select coalesce(sum(it2.quantity_change), 0) into v_qty_before
    from inventory_transactions it2
    join store_locations sl2 on sl2.id = it2.store_location_id
    where it2.product_id = v_row.product_id
      and sl2.branch_id = v_branch_id
      and it2.txn_date < v_row.txn_date;

    select avg_unit_cost into v_current_avg
    from product_branch_costs
    where product_id = v_row.product_id and branch_id = v_branch_id;

    if v_qty_before <= 0 then
      v_old_avg := 0;
    else
      v_old_avg := greatest(
        ((coalesce(v_current_avg, 0) * (v_qty_before + v_row.total_qty)) - (v_row.total_qty * coalesce(v_row.weighted_cost, 0))) / v_qty_before,
        0
      );
    end if;

    update product_branch_costs
    set avg_unit_cost = v_old_avg, updated_at = now()
    where product_id = v_row.product_id and branch_id = v_branch_id;

    insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost)
    values (v_company_id, v_row.product_id, v_branch_id, v_old_avg);

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes, unit_cost, classification
    ) values (
      v_company_id, v_row.product_id, v_row.store_location_id, 'goods_receipt', -v_row.total_qty,
      'goods_receipt_items', v_row.sample_reference_id, 'Reversed — purchase order voided', v_row.weighted_cost, null
    );
  end loop;

  update purchase_order_items poi
  set quantity_received = poi.quantity_received - gri.quantity_received
  from goods_receipt_items gri
  where gri.goods_receipt_id = p_goods_receipt_id
    and gri.purchase_order_item_id = poi.id;

  update goods_receipts set voided_at = now() where id = p_goods_receipt_id;
end;
$$;
comment on function fn_reverse_goods_receipt is 'Reverses one receipt''s ledger/cost effects exactly, or raises and rolls back entirely if a later receipt or already-used stock makes an exact reversal impossible.';

-- Voids a purchase order: reverses every not-yet-voided receipt on it (see
-- fn_reverse_goods_receipt), then marks it cancelled. Raises (and rolls
-- back the whole void) if any receipt cannot be reversed exactly.
create or replace function fn_void_purchase_order(
  p_purchase_order_id uuid,
  p_company_id uuid,
  p_branch_id uuid
) returns void language plpgsql as $$
declare
  v_status  po_status;
  v_receipt record;
begin
  select status into v_status
  from purchase_orders
  where id = p_purchase_order_id and company_id = p_company_id and branch_id = p_branch_id;

  if v_status is null then
    raise exception 'Purchase order not found.';
  end if;
  if v_status in ('draft', 'cancelled') then
    raise exception 'This order cannot be voided.';
  end if;

  for v_receipt in
    select id from goods_receipts
    where purchase_order_id = p_purchase_order_id and voided_at is null
  loop
    perform fn_reverse_goods_receipt(v_receipt.id);
  end loop;

  update purchase_orders set status = 'cancelled' where id = p_purchase_order_id;
end;
$$;
comment on function fn_void_purchase_order is 'Voids a PO after reversing every receipt on it exactly. Aborts entirely (nothing reverses, status unchanged) if any receipt cannot be reversed exactly.';

grant execute on function public.fn_reverse_goods_receipt(uuid) to authenticated, service_role;
grant execute on function public.fn_void_purchase_order(uuid, uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
