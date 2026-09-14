-- Scale bundle component costing to the price actually paid on the receipt
-- line, instead of always applying the catalog's static allocated_cost
-- verbatim. Each component still gets the same *relative share* of the
-- bundle (set at admin time via product_components.allocated_cost), but
-- that share is scaled by (price paid this receipt / bundle's catalog
-- unit_cost_price) before being blended into the component's weighted-
-- average cost. A bundle received for free (unit_cost 0) now correctly
-- costs its components at $0 too, instead of the stale catalog split.

create or replace function fn_after_goods_receipt_item_insert()
returns trigger language plpgsql as $$
declare
  v_company_id          uuid;
  v_branch_id           uuid;
  v_po_id                uuid;
  v_is_set               boolean;
  v_bundle_catalog_cost  numeric;
  v_price_ratio          numeric;
  v_has_components       boolean;
  v_component            record;
  v_component_cost       numeric;
begin
  select gr.company_id, gr.branch_id into v_company_id, v_branch_id
  from goods_receipts gr where gr.id = new.goods_receipt_id;

  select p.is_set, p.unit_cost_price into v_is_set, v_bundle_catalog_cost
  from products p where p.id = new.product_id;

  select exists (
    select 1 from product_components pc where pc.set_product_id = new.product_id
  ) into v_has_components;

  if coalesce(v_is_set, false) and v_has_components then
    v_price_ratio := case
      when coalesce(v_bundle_catalog_cost, 0) > 0 then coalesce(new.unit_cost, 0) / v_bundle_catalog_cost
      else 1
    end;

    for v_component in
      select pc.component_product_id, pc.quantity, pc.allocated_cost
      from product_components pc
      where pc.set_product_id = new.product_id
    loop
      v_component_cost := case
        when v_component.quantity > 0
          then (coalesce(v_component.allocated_cost, 0) * v_price_ratio) / v_component.quantity
        else 0
      end;

      perform fn_apply_goods_receipt_cost(
        v_company_id, v_component.component_product_id, v_branch_id,
        new.quantity_received * v_component.quantity, v_component_cost
      );

      insert into inventory_transactions (
        company_id, product_id, store_location_id, txn_type, quantity_change,
        reference_table, reference_id, notes, unit_cost, classification
      ) values (
        v_company_id,
        v_component.component_product_id,
        new.store_location_id,
        'goods_receipt',
        new.quantity_received * v_component.quantity,
        'goods_receipt_items',
        new.id,
        'Unpacked from bundle on receipt',
        v_component_cost,
        new.classification
      );
    end loop;
  else
    perform fn_apply_goods_receipt_cost(
      v_company_id, new.product_id, v_branch_id, new.quantity_received, new.unit_cost
    );

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes, unit_cost, classification
    ) values (
      v_company_id, new.product_id, new.store_location_id, 'goods_receipt', new.quantity_received,
      'goods_receipt_items', new.id, 'Auto-created on receipt', new.unit_cost, new.classification
    );
  end if;

  if new.purchase_order_item_id is not null then
    update purchase_order_items
      set quantity_received = quantity_received + new.quantity_received
      where id = new.purchase_order_item_id
      returning purchase_order_id into v_po_id;

    perform fn_recompute_po_status(v_po_id);
  end if;

  return new;
end;
$$;
comment on function fn_after_goods_receipt_item_insert is 'Automates "receive the correct ordered quantity": writes the ledger entry (unpacking bundles into their components, cost-scaled to the price actually paid this receipt vs. the bundle''s catalog price), tracks received qty against the PO line, rolls the PO status forward, and maintains running average cost.';

notify pgrst, 'reload schema';
