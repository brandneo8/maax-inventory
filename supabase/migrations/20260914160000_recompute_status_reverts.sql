-- fn_recompute_po_status previously only moved a PO's status forward
-- (sent -> partially_received -> received) and silently no-op'd once
-- total_received dropped back to 0 -- which now happens for real when a
-- receipt is removed (fn_reverse_goods_receipt rolls quantity_received back
-- down and calls this function). Left unfixed, the status stayed stuck on
-- "received"/"partially_received" with 0 actually received, and since
-- canReceive() excludes "received" the Receive-stock action disappeared
-- too, blocking re-receiving on the correct date.

create or replace function fn_recompute_po_status(p_po_id uuid)
returns void language plpgsql as $$
declare
  v_total_ordered  numeric;
  v_total_received numeric;
  v_current_status po_status;
begin
  select status into v_current_status from purchase_orders where id = p_po_id;
  if v_current_status in ('draft', 'cancelled') then
    return;  -- don't auto-transition orders that haven't been sent, or are cancelled
  end if;

  select coalesce(sum(quantity_ordered), 0), coalesce(sum(quantity_received), 0)
    into v_total_ordered, v_total_received
    from purchase_order_items where purchase_order_id = p_po_id;

  if v_total_received <= 0 then
    if v_current_status in ('partially_received', 'received') then
      update purchase_orders set status = 'sent' where id = p_po_id;
    end if;
  elsif v_total_received >= v_total_ordered then
    update purchase_orders set status = 'received' where id = p_po_id;
  else
    update purchase_orders set status = 'partially_received' where id = p_po_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
