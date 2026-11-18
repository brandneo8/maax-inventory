-- Removing the last receipt on a received order used to flip the PO back to
-- draft (two-stage stock-in). That left a stuck "draft" that still had voided
-- goods_receipts rows: fn_save_stock_in and delete-draft both refused to touch
-- it. Undoing a receive should void the order (cancelled); redo via Duplicate.

create or replace function public.fn_recompute_po_status(p_po_id uuid)
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
    -- Was received (or partially), then every receipt was reversed: stay voided.
    -- Do not reopen as draft — staff duplicate into a new draft if they need to redo.
    if v_current_status in ('sent', 'partially_received', 'received') then
      update purchase_orders set status = 'cancelled' where id = p_po_id;
    end if;
  elsif v_total_received >= v_total_ordered then
    update purchase_orders set status = 'received' where id = p_po_id;
  else
    update purchase_orders set status = 'partially_received' where id = p_po_id;
  end if;
end;
$$;

comment on function public.fn_recompute_po_status(uuid) is
  'Rolls PO status from line quantities. Fully reversed receives become cancelled (not draft). Cancelled orders are never auto-changed.';

-- Repair drafts that were incorrectly reopened after a receipt reverse: they
-- still have only voided receipts and zero quantity_received.
update public.purchase_orders po
set status = 'cancelled'
where po.status = 'draft'
  and po.planning_only = false
  and exists (
    select 1 from public.goods_receipts gr
    where gr.purchase_order_id = po.id
  )
  and not exists (
    select 1 from public.goods_receipts gr
    where gr.purchase_order_id = po.id and gr.voided_at is null
  )
  and coalesce((
    select sum(poi.quantity_received)
    from public.purchase_order_items poi
    where poi.purchase_order_id = po.id
  ), 0) <= 0;

notify pgrst, 'reload schema';
