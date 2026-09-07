-- Receiving a bundle SKU stocks its components instead of the kit itself.
create or replace function public.fn_after_goods_receipt_item_insert()
returns trigger language plpgsql as $$
declare
  v_company_id uuid;
  v_po_id uuid;
  v_is_set boolean;
  v_has_components boolean;
  v_component record;
begin
  select gr.company_id into v_company_id from public.goods_receipts gr where gr.id = new.goods_receipt_id;

  select p.is_set into v_is_set from public.products p where p.id = new.product_id;
  select exists (
    select 1 from public.product_components pc where pc.set_product_id = new.product_id
  ) into v_has_components;

  if coalesce(v_is_set, false) and v_has_components then
    for v_component in
      select pc.component_product_id, pc.quantity
      from public.product_components pc
      where pc.set_product_id = new.product_id
    loop
      insert into public.inventory_transactions (
        company_id, product_id, store_location_id, txn_type, quantity_change,
        reference_table, reference_id, notes
      ) values (
        v_company_id,
        v_component.component_product_id,
        new.store_location_id,
        'goods_receipt',
        new.quantity_received * v_component.quantity,
        'goods_receipt_items',
        new.id,
        'Unpacked from bundle on receipt'
      );
    end loop;
  else
    insert into public.inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes
    ) values (
      v_company_id, new.product_id, new.store_location_id, 'goods_receipt', new.quantity_received,
      'goods_receipt_items', new.id, 'Auto-created on receipt'
    );
  end if;

  if new.purchase_order_item_id is not null then
    update public.purchase_order_items
      set quantity_received = quantity_received + new.quantity_received
      where id = new.purchase_order_item_id
      returning purchase_order_id into v_po_id;

    perform public.fn_recompute_po_status(v_po_id);
  end if;

  return new;
end;
$$;

comment on function public.fn_after_goods_receipt_item_insert is
  'Receives a PO line, then stocks either that SKU or its bundle components. Over-receipt is allowed.';
