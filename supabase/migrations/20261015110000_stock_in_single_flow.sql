-- Stock-in as one workflow: add product lines, confirm quantities, confirm
-- prices and FX, then receive. An order is a Draft until it's received (no
-- separate "sent" stage, no partial deliveries). fn_save_stock_in saves the
-- draft (creating it, or replacing a draft's lines) and, when p_receive is
-- set, receives exactly those quantities at those prices in the same
-- transaction through fn_receive_goods.
-- New function only: no table, column or row changes.

create or replace function fn_save_stock_in(
  p_company_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_po_number text,
  p_supplier_id uuid,
  p_order_date date,
  p_notes text,
  p_fx_adjustment numeric,
  p_user text,
  -- [{product_id, classification, quantity, unit_price}] in display order
  p_lines jsonb,
  p_receive boolean,
  p_receipt_id uuid,
  p_received_date date,
  p_invoice_reference text,
  p_rounding_adjustment numeric,
  p_store_location_id uuid,
  -- [{product_id, classification, quantity}] received at no charge
  p_free_lines jsonb
) returns uuid language plpgsql as $$
declare
  v_order_id uuid := p_order_id;
  v_status po_status;
  v_items jsonb;
begin
  if p_supplier_id is null then
    raise exception 'Select a supplier.';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id and company_id = p_company_id) then
    raise exception 'That supplier wasn''t found.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one product.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(quantity numeric, unit_price numeric)
    where x.quantity is null or x.quantity <= 0 or coalesce(x.unit_price, 0) < 0
  ) then
    raise exception 'Every line needs a quantity above zero and a price of at least $0.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid)
    where not exists (select 1 from products p where p.id = x.product_id and p.company_id = p_company_id)
  ) then
    raise exception 'A product on this order wasn''t found. Refresh the page and try again.';
  end if;

  if v_order_id is null then
    insert into purchase_orders (
      company_id, branch_id, supplier_id, po_number, status, order_date, notes, created_by, planning_only, fx_adjustment
    ) values (
      p_company_id, p_branch_id, p_supplier_id, p_po_number, 'draft', p_order_date, p_notes, p_user, false,
      coalesce(p_fx_adjustment, 0)
    )
    returning id into v_order_id;
  else
    select status into v_status
    from purchase_orders
    where id = v_order_id and company_id = p_company_id and branch_id = p_branch_id and planning_only = false
    for update;
    if not found then
      raise exception 'Order not found.';
    end if;
    if v_status <> 'draft' then
      raise exception 'This order has already been received, so it can''t be changed here. Refresh the page.';
    end if;
    if exists (select 1 from goods_receipts where purchase_order_id = v_order_id) then
      raise exception 'This order had stock received on it (since removed), so its lines can''t be changed. Duplicate it into a new order instead.';
    end if;
    update purchase_orders
    set supplier_id = p_supplier_id, order_date = p_order_date, notes = p_notes,
        fx_adjustment = coalesce(p_fx_adjustment, 0)
    where id = v_order_id;
    delete from purchase_order_items where purchase_order_id = v_order_id;
  end if;

  insert into purchase_order_items (
    purchase_order_id, product_id, classification, quantity_ordered, unit_price, sort_order
  )
  select v_order_id,
    (e.item ->> 'product_id')::uuid,
    coalesce((e.item ->> 'classification')::product_classification, 'retail'),
    (e.item ->> 'quantity')::numeric,
    coalesce((e.item ->> 'unit_price')::numeric, 0),
    (e.ord - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as e(item, ord);

  if coalesce(p_receive, false) then
    -- Every line received in full, at its price; free goods alongside at $0.
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
        'purchase_order_item_id', poi.id,
        'product_id', poi.product_id,
        'store_location_id', p_store_location_id,
        'quantity_received', poi.quantity_ordered,
        'unit_cost', poi.unit_price,
        'classification', null
      ) as item, poi.sort_order as ord
      from purchase_order_items poi
      where poi.purchase_order_id = v_order_id
      union all
      select jsonb_build_object(
        'purchase_order_item_id', null,
        'product_id', (e.item ->> 'product_id')::uuid,
        'store_location_id', p_store_location_id,
        'quantity_received', (e.item ->> 'quantity')::numeric,
        'unit_cost', 0,
        'classification', e.item ->> 'classification'
      ), 100000 + e.ord
      from jsonb_array_elements(coalesce(p_free_lines, '[]'::jsonb)) with ordinality as e(item, ord)
    ) as rows;

    perform fn_receive_goods(
      p_company_id, p_branch_id, v_order_id, p_receipt_id, p_received_date, p_notes, p_invoice_reference,
      p_rounding_adjustment, p_fx_adjustment, p_user, v_items, false, false
    );
  end if;

  return v_order_id;
end;
$$;

grant execute on function fn_save_stock_in(
  uuid, uuid, uuid, text, uuid, date, text, numeric, text, jsonb, boolean, uuid, date, text, numeric, uuid, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';
