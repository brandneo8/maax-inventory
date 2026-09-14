-- Branch-level weighted-average product costing.
--
-- product_branch_costs holds one running average unit cost per (product,
-- branch), recomputed on every goods receipt using a standard moving-average
-- blend: new_avg = (qty_on_hand_before * old_avg + qty_received * received_cost)
--                  / (qty_on_hand_before + qty_received).
-- Usage transactions (retail/inhouse use) do NOT change the average — they
-- are costed AT the current average and that cost is snapshotted onto the
-- inventory_transactions row so later receipts never rewrite historical COGS.
--
-- product_branch_cost_history is an append-only log of every time the
-- average changes, so "valuation as of date X" can use the cost that was
-- actually in effect on that date rather than today's cost.

create table if not exists product_branch_costs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  avg_unit_cost   numeric(12,4) not null default 0,
  updated_at      timestamptz not null default now(),
  unique (product_id, branch_id)
);
comment on table product_branch_costs is 'Running weighted-average unit cost per product per branch, maintained by fn_apply_goods_receipt_cost on every goods receipt.';

create table if not exists product_branch_cost_history (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  branch_id       uuid not null references branches(id) on delete cascade,
  avg_unit_cost   numeric(12,4) not null,
  effective_at    timestamptz not null default now()
);
comment on table product_branch_cost_history is 'Append-only log of avg_unit_cost changes, so point-in-time inventory valuation can use the cost that was in effect on a past date.';

create index if not exists idx_product_branch_cost_history_lookup
  on product_branch_cost_history (product_id, branch_id, effective_at);

alter table inventory_transactions add column if not exists unit_cost numeric(12,4);
comment on column inventory_transactions.unit_cost is 'Cost per unit at the time of this transaction: the receipt''s own cost for goods_receipt rows, or the branch''s current average cost snapshotted in for usage rows. Null for transaction types not yet costed (waste, count_adjustment, transfer).';
alter table inventory_transactions add column if not exists classification product_classification;
comment on column inventory_transactions.classification is 'Product type at the time of this transaction (retail/inhouse/gwp/...), snapshotted so COGS-by-type reporting does not depend on the catalog''s current tagging.';

alter table goods_receipts add column if not exists rounding_adjustment numeric(12,2) not null default 0;
comment on column goods_receipts.rounding_adjustment is 'Manual adjustment (e.g. invoice rounding) entered at receiving time. Not allocated to any product; counted directly as a cost-of-goods-sold expense dated by received_date.';

alter table product_branch_costs enable row level security;
drop policy if exists product_branch_costs_company_isolation on product_branch_costs;
create policy product_branch_costs_company_isolation on product_branch_costs
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));
grant select, insert, update, delete on public.product_branch_costs to authenticated;
grant all on public.product_branch_costs to service_role;

alter table product_branch_cost_history enable row level security;
drop policy if exists product_branch_cost_history_company_isolation on product_branch_cost_history;
create policy product_branch_cost_history_company_isolation on product_branch_cost_history
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));
grant select, insert, update, delete on public.product_branch_cost_history to authenticated;
grant all on public.product_branch_cost_history to service_role;

-- Blends a newly received quantity/cost into the running average for one
-- (product, branch), then logs the resulting average to the history table.
-- Must be called BEFORE the corresponding inventory_transactions row is
-- inserted, so the "quantity on hand before" read is accurate.
create or replace function fn_apply_goods_receipt_cost(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_qty numeric,
  p_unit_cost numeric
) returns void language plpgsql as $$
declare
  v_qty_on_hand numeric;
  v_old_avg     numeric;
  v_new_avg     numeric;
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  insert into product_branch_costs (company_id, product_id, branch_id, avg_unit_cost)
  values (p_company_id, p_product_id, p_branch_id, 0)
  on conflict (product_id, branch_id) do nothing;

  select avg_unit_cost into v_old_avg
  from product_branch_costs
  where product_id = p_product_id and branch_id = p_branch_id
  for update;

  select coalesce(sum(it.quantity_change), 0) into v_qty_on_hand
  from inventory_transactions it
  join store_locations sl on sl.id = it.store_location_id
  where it.product_id = p_product_id and sl.branch_id = p_branch_id;

  if v_qty_on_hand <= 0 then
    v_new_avg := coalesce(p_unit_cost, 0);
  else
    v_new_avg := ((v_qty_on_hand * v_old_avg) + (p_qty * coalesce(p_unit_cost, 0))) / (v_qty_on_hand + p_qty);
  end if;

  update product_branch_costs
  set avg_unit_cost = v_new_avg, updated_at = now()
  where product_id = p_product_id and branch_id = p_branch_id;

  insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost)
  values (p_company_id, p_product_id, p_branch_id, v_new_avg);
end;
$$;

-- Replaces the original receiving trigger to also maintain the running
-- average cost and snapshot unit_cost/classification onto each ledger row.
create or replace function fn_after_goods_receipt_item_insert()
returns trigger language plpgsql as $$
declare
  v_company_id uuid;
  v_branch_id  uuid;
  v_po_id      uuid;
  v_is_set     boolean;
  v_has_components boolean;
  v_component  record;
  v_component_cost numeric;
begin
  select gr.company_id, gr.branch_id into v_company_id, v_branch_id
  from goods_receipts gr where gr.id = new.goods_receipt_id;

  select p.is_set into v_is_set from products p where p.id = new.product_id;
  select exists (
    select 1 from product_components pc where pc.set_product_id = new.product_id
  ) into v_has_components;

  if coalesce(v_is_set, false) and v_has_components then
    for v_component in
      select pc.component_product_id, pc.quantity, pc.allocated_cost
      from product_components pc
      where pc.set_product_id = new.product_id
    loop
      v_component_cost := case
        when v_component.quantity > 0 then coalesce(v_component.allocated_cost, 0) / v_component.quantity
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

-- One-time backfill: seed a starting average cost for every product+branch
-- that already has stock on hand today, using the product's current catalog
-- cost as the baseline (confirmed with the user — no historical receipt
-- cost trail exists to derive a better number from).
insert into product_branch_costs (company_id, product_id, branch_id, avg_unit_cost)
select p.company_id, p.id, stock.branch_id, coalesce(p.unit_cost_price, 0)
from products p
join (
  select it.product_id, sl.branch_id, sum(it.quantity_change) as qty_on_hand
  from inventory_transactions it
  join store_locations sl on sl.id = it.store_location_id
  group by it.product_id, sl.branch_id
  having sum(it.quantity_change) > 0
) stock on stock.product_id = p.id
on conflict (product_id, branch_id) do nothing;

insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost)
select company_id, product_id, branch_id, avg_unit_cost
from product_branch_costs;

notify pgrst, 'reload schema';
