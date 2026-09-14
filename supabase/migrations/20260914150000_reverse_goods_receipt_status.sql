-- Reversing a single receipt (used both by void-the-whole-PO and by
-- removing one erroneous receipt on its own) should also roll the PO's
-- status back if that receipt was what pushed it to partially_received/
-- received. fn_recompute_po_status already no-ops for draft/cancelled
-- orders, so calling it here is safe in every caller.

create or replace function fn_reverse_goods_receipt(p_goods_receipt_id uuid)
returns void language plpgsql as $$
declare
  v_company_id   uuid;
  v_branch_id    uuid;
  v_po_id        uuid;
  v_voided_at    timestamptz;
  v_row          record;
  v_product_name text;
  v_qty_before   numeric;
  v_current_avg  numeric;
  v_old_avg      numeric;
  v_on_hand      numeric;
begin
  select company_id, branch_id, purchase_order_id, voided_at
    into v_company_id, v_branch_id, v_po_id, v_voided_at
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
      raise exception 'Cannot remove: % has been received again since this receipt — remove the newer one first.', coalesce(v_product_name, 'a product');
    end if;

    select coalesce(sum(quantity_change), 0) into v_on_hand
    from inventory_transactions
    where product_id = v_row.product_id and store_location_id = v_row.store_location_id;

    if v_on_hand < v_row.total_qty then
      raise exception 'Cannot remove: some of the % received here has already been used or sold.', coalesce(v_product_name, 'stock');
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
      'goods_receipt_items', v_row.sample_reference_id, 'Reversed — receipt removed', v_row.weighted_cost, null
    );
  end loop;

  update purchase_order_items poi
  set quantity_received = poi.quantity_received - gri.quantity_received
  from goods_receipt_items gri
  where gri.goods_receipt_id = p_goods_receipt_id
    and gri.purchase_order_item_id = poi.id;

  update goods_receipts set voided_at = now() where id = p_goods_receipt_id;

  if v_po_id is not null then
    perform fn_recompute_po_status(v_po_id);
  end if;
end;
$$;
comment on function fn_reverse_goods_receipt is 'Reverses one receipt''s ledger/cost effects exactly, rolls back its PO line quantities and status, or raises and rolls back entirely if a later receipt or already-used stock makes an exact reversal impossible.';

notify pgrst, 'reload schema';
