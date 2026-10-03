-- Removing a receipt now reads as if it was never received:
--   * the reversal row is dated just after the receipt's own rows (it was
--     dated at removal time, so balances and reports carried the stock from
--     the received date until the day it was removed — including across any
--     count taken in between);
--   * a voided receipt's rows (receipt + reversal, netting to zero) drop out
--     of inventory_transactions_effective entirely, so its cost no longer
--     stays blended into the average (the replay engine treated the
--     reversal as plain outflow, leaving the receipt's cost in);
--   * the "received again since" block is gone — it guarded the old manual
--     cost-unwind, and costs are now replayed from full history instead.
-- The "already used or sold" check stays. Count true-ups the receipt caused
-- are lifted by the app before this runs (see removeLateReceiptTrueUps).

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
)
and not exists (
  select 1
  from goods_receipt_items gri
  join goods_receipts gr on gr.id = gri.goods_receipt_id
  where it.reference_table = 'goods_receipt_items'
    and gri.id = it.reference_id
    and gr.voided_at is not null
);
comment on view inventory_transactions_effective is 'The ledger minus anything a voided count or a removed receipt wrote — what every cost, usage and report calculation reads.';
grant select on inventory_transactions_effective to authenticated, service_role;

create or replace function fn_reverse_goods_receipt(p_goods_receipt_id uuid)
returns void language plpgsql as $$
declare
  v_company_id   uuid;
  v_branch_id    uuid;
  v_po_id        uuid;
  v_voided_at    timestamptz;
  v_row          record;
  v_product_name text;
  v_on_hand      numeric;
  v_product_ids  uuid[] := '{}';
  v_product_id   uuid;
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
      (array_agg(it.reference_id order by it.txn_date))[1] as sample_reference_id
    from inventory_transactions it
    where it.reference_table = 'goods_receipt_items'
      and it.reference_id in (select id from goods_receipt_items where goods_receipt_id = p_goods_receipt_id)
      and it.txn_type = 'goods_receipt'
    group by it.product_id, it.store_location_id
  loop
    v_product_ids := array_append(v_product_ids, v_row.product_id);
    if v_row.total_qty <= 0 then
      continue;
    end if;

    select name into v_product_name from products where id = v_row.product_id;

    select coalesce(sum(quantity_change), 0) into v_on_hand
    from inventory_transactions
    where product_id = v_row.product_id and store_location_id = v_row.store_location_id;

    if v_on_hand < v_row.total_qty then
      raise exception 'Cannot remove: some of the % received here has already been used or sold.', coalesce(v_product_name, 'stock');
    end if;

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes, unit_cost, classification, txn_date
    ) values (
      v_company_id, v_row.product_id, v_row.store_location_id, 'goods_receipt', -v_row.total_qty,
      'goods_receipt_items', v_row.sample_reference_id, 'Reversed — receipt removed', v_row.weighted_cost, null,
      v_row.txn_date + interval '1 millisecond'
    );
  end loop;

  update purchase_order_items poi
  set quantity_received = poi.quantity_received - gri.quantity_received
  from goods_receipt_items gri
  where gri.goods_receipt_id = p_goods_receipt_id
    and gri.purchase_order_item_id = poi.id;

  update goods_receipts set voided_at = now() where id = p_goods_receipt_id;

  -- The insert trigger replayed cost before voided_at was set; replay again
  -- now that the receipt's rows are out of the effective ledger.
  foreach v_product_id in array coalesce((select array_agg(distinct p) from unnest(v_product_ids) p), '{}'::uuid[])
  loop
    perform fn_recompute_branch_cost(v_company_id, v_product_id, v_branch_id);
  end loop;

  if v_po_id is not null then
    perform fn_recompute_po_status(v_po_id);
  end if;
end;
$$;
comment on function fn_reverse_goods_receipt is 'Removes a receipt as if it was never received: a reversal dated right after it, both dropped from the effective ledger, cost replayed. Raises (rolling back entirely) if some of the stock has already been used or sold.';
grant execute on function public.fn_reverse_goods_receipt(uuid) to authenticated, service_role;

-- Receipts removed before this change: replay cost for what they touched,
-- now that their rows are out of the effective ledger.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct gr.company_id, it.product_id, gr.branch_id
    from goods_receipts gr
    join goods_receipt_items gri on gri.goods_receipt_id = gr.id
    join inventory_transactions it on it.reference_table = 'goods_receipt_items' and it.reference_id = gri.id
    where gr.voided_at is not null
  loop
    perform fn_recompute_branch_cost(v_pair.company_id, v_pair.product_id, v_pair.branch_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
