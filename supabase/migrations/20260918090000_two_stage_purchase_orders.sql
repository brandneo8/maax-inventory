-- Collapse the purchase-order lifecycle from draft -> sent -> confirmed ->
-- partially_received -> received into two stages: draft -> received.
-- Confirming a draft now goes straight to "received" (no more separate
-- "sent" stage, and a single quantity field is entered once at confirm
-- time). fn_recompute_po_status previously refused to move a draft order
-- forward at all (it required "sent" first) and rolled a fully-reversed
-- order back to "sent" -- both assumptions no longer hold.
create or replace function fn_recompute_po_status(p_po_id uuid)
returns void language plpgsql as $$
declare
  v_total_ordered  numeric;
  v_total_received numeric;
  v_current_status po_status;
begin
  select status into v_current_status from purchase_orders where id = p_po_id;
  if v_current_status = 'cancelled' then
    return;  -- never auto-transition a voided order
  end if;

  select coalesce(sum(quantity_ordered), 0), coalesce(sum(quantity_received), 0)
    into v_total_ordered, v_total_received
    from purchase_order_items where purchase_order_id = p_po_id;

  if v_total_received <= 0 then
    if v_current_status in ('sent', 'partially_received', 'received') then
      update purchase_orders set status = 'draft' where id = p_po_id;
    end if;
  elsif v_total_received >= v_total_ordered then
    update purchase_orders set status = 'received' where id = p_po_id;
  else
    update purchase_orders set status = 'partially_received' where id = p_po_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
