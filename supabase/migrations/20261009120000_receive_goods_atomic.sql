-- Receiving as one transaction. The receipt header and its items are written
-- together (the item trigger books the stock, cost and order status), after
-- checks made inside a lock on the order: the order can still be received,
-- no count is in progress, the received date isn't in the future, each line
-- belongs to this order and salon, and nothing is received beyond what's
-- still to come unless the person saving confirmed it. Two people (or tabs)
-- receiving the same order are handled one after the other, so the second
-- sees what the first received.
-- New function only: no table, column or row changes.

/** The lines passed to fn_receive_goods, as rows. */
create or replace function fn_receive_goods_items(p_items jsonb)
returns table (
  purchase_order_item_id uuid,
  product_id uuid,
  store_location_id uuid,
  quantity_received numeric,
  unit_cost numeric,
  classification product_classification
) language sql immutable as $$
  select x.purchase_order_item_id, x.product_id, x.store_location_id, x.quantity_received, x.unit_cost, x.classification
  from jsonb_to_recordset(p_items) as x(
    purchase_order_item_id uuid,
    product_id uuid,
    store_location_id uuid,
    quantity_received numeric,
    unit_cost numeric,
    classification product_classification
  );
$$;

create or replace function fn_receive_goods(
  p_company_id uuid,
  p_branch_id uuid,
  p_purchase_order_id uuid,
  p_receipt_id uuid,
  p_received_date date,
  p_notes text,
  p_invoice_reference text,
  p_rounding_adjustment numeric,
  p_fx_adjustment numeric,
  p_user text,
  p_items jsonb,
  p_free_goods_only boolean,
  p_allow_over_receipt boolean
) returns void language plpgsql as $$
declare
  v_status po_status;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_over record;
begin
  select status into v_status
  from purchase_orders
  where id = p_purchase_order_id and company_id = p_company_id and branch_id = p_branch_id and planning_only = false
  for update;
  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if v_status = 'cancelled' then
    raise exception 'This order is voided, so stock can''t be received into it. Duplicate it into a new order instead.';
  end if;
  if p_free_goods_only then
    if v_status = 'draft' then
      raise exception 'This order can''t take free goods yet — send it first.';
    end if;
  elsif v_status not in ('draft', 'sent', 'confirmed', 'partially_received') then
    raise exception 'This order has already been fully received. Refresh the page — to add more, use Add free goods or remove a receipt first.';
  end if;

  if exists (
    select 1 from inventory_counts
    where company_id = p_company_id and branch_id = p_branch_id and status = 'in_progress'
  ) then
    raise exception 'An inventory count is currently in progress for this salon. Complete or void it before you receive stock.';
  end if;

  if p_received_date is null then
    raise exception 'Enter the received date.';
  end if;
  if p_received_date > v_today then
    raise exception 'The received date can''t be in the future (today is %).', to_char(v_today, 'FMDD Mon YYYY');
  end if;

  if not exists (select 1 from fn_receive_goods_items(p_items)) then
    raise exception 'Enter a received quantity for at least one line.';
  end if;
  if exists (select 1 from fn_receive_goods_items(p_items) where quantity_received is null or quantity_received <= 0) then
    raise exception 'Every received quantity has to be above zero.';
  end if;
  if exists (select 1 from fn_receive_goods_items(p_items) where coalesce(unit_cost, 0) < 0) then
    raise exception 'Unit costs can''t be negative.';
  end if;
  if exists (
    select 1 from fn_receive_goods_items(p_items) i
    where not exists (select 1 from store_locations l where l.id = i.store_location_id and l.branch_id = p_branch_id)
  ) then
    raise exception 'A line is set to a storage location outside this salon.';
  end if;
  if exists (select 1 from fn_receive_goods_items(p_items) where purchase_order_item_id is null and classification is null) then
    raise exception 'Select a type for each free/GWP item.';
  end if;
  if p_free_goods_only and exists (select 1 from fn_receive_goods_items(p_items) where purchase_order_item_id is not null) then
    raise exception 'Free goods can''t be received against order lines.';
  end if;
  if exists (
    select 1 from fn_receive_goods_items(p_items) i
    where i.purchase_order_item_id is not null
      and not exists (
        select 1 from purchase_order_items poi
        where poi.id = i.purchase_order_item_id
          and poi.purchase_order_id = p_purchase_order_id
          and poi.product_id = i.product_id
      )
  ) then
    raise exception 'A line doesn''t belong to this order. Refresh the page and try again.';
  end if;

  if not coalesce(p_allow_over_receipt, false) then
    select coalesce(p.order_name, p.name) as label,
           poi.quantity_ordered - poi.quantity_received as remaining,
           sum(i.quantity_received) as receiving
      into v_over
    from fn_receive_goods_items(p_items) i
    join purchase_order_items poi on poi.id = i.purchase_order_item_id
    join products p on p.id = poi.product_id
    group by poi.id, p.order_name, p.name, poi.quantity_ordered, poi.quantity_received
    having sum(i.quantity_received) > poi.quantity_ordered - poi.quantity_received
    limit 1;
    if found then
      raise exception 'Receiving % of % is more than the % still to come on this order. Refresh the page to see what''s already been received, and confirm over-deliveries when you save.',
        trim(to_char(v_over.receiving, 'FM999999990.##')), v_over.label,
        trim(to_char(greatest(v_over.remaining, 0), 'FM999999990.##'));
    end if;
  end if;

  insert into goods_receipts (
    id, company_id, purchase_order_id, branch_id, received_date, received_by, notes,
    invoice_reference, rounding_adjustment, fx_adjustment
  ) values (
    p_receipt_id, p_company_id, p_purchase_order_id, p_branch_id, p_received_date, p_user, p_notes,
    p_invoice_reference, coalesce(p_rounding_adjustment, 0), coalesce(p_fx_adjustment, 0)
  );

  insert into goods_receipt_items (
    goods_receipt_id, purchase_order_item_id, product_id, store_location_id, quantity_received, unit_cost, classification
  )
  select p_receipt_id, i.purchase_order_item_id, i.product_id, i.store_location_id, i.quantity_received,
    case when i.purchase_order_item_id is null then 0 else coalesce(i.unit_cost, 0) end,
    case when i.purchase_order_item_id is null then i.classification else null end
  from fn_receive_goods_items(p_items) i;

  -- Products received here show in this salon's catalog.
  insert into product_branches (product_id, branch_id)
  select distinct i.product_id, p_branch_id from fn_receive_goods_items(p_items) i
  on conflict (product_id, branch_id) do nothing;
end;
$$;

grant execute on function fn_receive_goods_items(jsonb) to authenticated, service_role;
grant execute on function fn_receive_goods(uuid, uuid, uuid, uuid, date, text, text, numeric, numeric, text, jsonb, boolean, boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';
