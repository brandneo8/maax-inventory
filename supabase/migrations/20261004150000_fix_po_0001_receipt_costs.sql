-- One-off data correction: PO-2026-0001 (Min, received 2026-04-06) wrote its
-- stock rows with no unit cost, though its receipt lines carry the invoice
-- prices — so ~$3,080 of stock entered the average at $0 and every sale or
-- use of those products since was costed too low. Fill in the missing costs
-- exactly as receiving does today (fn_after_goods_receipt_item_insert):
-- a plain line at its receipt price; a bundle's contents at their share of
-- the price paid (allocated_cost scaled by paid ÷ catalog price, per unit).
-- Only rows still missing a cost are touched, so this is safe to re-run.
-- Then replay cost for every product it touched, which restamps the cost
-- of the sales, stock-outs and count variances that followed.

-- Plain lines: the stock row is the receipt line's own product.
update inventory_transactions it
set unit_cost = gri.unit_cost
from goods_receipt_items gri
join goods_receipts gr on gr.id = gri.goods_receipt_id
where gr.purchase_order_id = 'a7b60512-2cb2-4595-95e0-b388b76b6c97'
  and it.reference_table = 'goods_receipt_items'
  and it.reference_id = gri.id
  and it.txn_type = 'goods_receipt'
  and it.quantity_change > 0
  and it.unit_cost is null
  and it.product_id = gri.product_id
  and gri.unit_cost is not null;

-- Bundle lines: each stock row is one of the bundle's components.
update inventory_transactions it
set unit_cost = case
  when pc.quantity > 0 then
    coalesce(pc.allocated_cost, 0)
    * (case when coalesce(p.unit_cost_price, 0) > 0 then coalesce(gri.unit_cost, 0) / p.unit_cost_price else 1 end)
    / pc.quantity
  else 0
end
from goods_receipt_items gri
join goods_receipts gr on gr.id = gri.goods_receipt_id
join products p on p.id = gri.product_id and p.is_set
join product_components pc on pc.set_product_id = gri.product_id
where gr.purchase_order_id = 'a7b60512-2cb2-4595-95e0-b388b76b6c97'
  and it.reference_table = 'goods_receipt_items'
  and it.reference_id = gri.id
  and it.txn_type = 'goods_receipt'
  and it.quantity_change > 0
  and it.unit_cost is null
  and it.product_id = pc.component_product_id
  and it.product_id <> gri.product_id;

-- Replay cost for everything this order's receipt touched.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct it.company_id, it.product_id, sl.branch_id
    from inventory_transactions it
    join store_locations sl on sl.id = it.store_location_id
    join goods_receipt_items gri on gri.id = it.reference_id
    join goods_receipts gr on gr.id = gri.goods_receipt_id
    where it.reference_table = 'goods_receipt_items'
      and gr.purchase_order_id = 'a7b60512-2cb2-4595-95e0-b388b76b6c97'
  loop
    perform fn_recompute_branch_cost(v_pair.company_id, v_pair.product_id, v_pair.branch_id);
  end loop;
end $$;
