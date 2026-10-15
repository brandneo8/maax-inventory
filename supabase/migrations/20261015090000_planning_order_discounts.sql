-- Draft orders on /orders: a discount % per line (the unit price stays the
-- supplier's list price; the line costs list × (1 − discount)), and editing a
-- draft's lines in one transaction. Additive only: a new column (existing
-- lines get 0%) and a new function.

alter table purchase_order_items add column if not exists discount_percent numeric(5, 2) not null default 0;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_order_items_discount_percent_range'
  ) then
    alter table purchase_order_items
      add constraint purchase_order_items_discount_percent_range check (discount_percent >= 0 and discount_percent <= 100);
  end if;
end;
$$;
comment on column purchase_order_items.discount_percent is 'Discount off unit_price for this line, in percent (draft orders on /orders). The line costs quantity_ordered × unit_price × (1 − discount_percent / 100).';

/**
 * Replaces the lines of a draft order saved on /orders (planning_only), in
 * one transaction: p_lines = [{product_id, classification, quantity_ordered,
 * unit_price, discount_percent}] in display order. Every product must be one
 * of the company's.
 */
create or replace function fn_save_planning_order_lines(
  p_company_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_lines jsonb
) returns void language plpgsql as $$
begin
  perform 1 from purchase_orders
  where id = p_order_id and company_id = p_company_id and branch_id = p_branch_id and planning_only = true
  for update;
  if not found then
    raise exception 'Draft order not found.';
  end if;

  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'A draft order needs at least one product. Delete the draft instead.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(quantity_ordered numeric, unit_price numeric, discount_percent numeric)
    where x.quantity_ordered is null or x.quantity_ordered <= 0
       or coalesce(x.unit_price, 0) < 0
       or coalesce(x.discount_percent, 0) < 0 or coalesce(x.discount_percent, 0) > 100
  ) then
    raise exception 'Each line needs a quantity above zero, a price of at least $0 and a discount between 0%% and 100%%.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid)
    where not exists (select 1 from products p where p.id = x.product_id and p.company_id = p_company_id)
  ) then
    raise exception 'A product on this draft wasn''t found. Refresh the page and try again.';
  end if;

  delete from purchase_order_items where purchase_order_id = p_order_id;
  insert into purchase_order_items (
    purchase_order_id, product_id, classification, quantity_ordered, unit_price, discount_percent, sort_order
  )
  select p_order_id,
    (e.item ->> 'product_id')::uuid,
    (e.item ->> 'classification')::product_classification,
    (e.item ->> 'quantity_ordered')::numeric,
    coalesce((e.item ->> 'unit_price')::numeric, 0),
    coalesce((e.item ->> 'discount_percent')::numeric, 0),
    (e.ord - 1)::int
  from jsonb_array_elements(p_lines) with ordinality as e(item, ord);
end;
$$;

grant execute on function fn_save_planning_order_lines(uuid, uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
