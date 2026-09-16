-- Weighted-average costing moves from "incrementally blend using whatever
-- is on hand right now" to "always recompute from full history, in the
-- ledger's own business-date order." The incremental approach silently
-- assumed every insert happens in the same order as its date — which broke
-- the moment a receipt (or count, or stock-out) is entered against a date
-- other than today, the normal, expected way this app is used. The new
-- approach makes the entered date genuinely authoritative for cost, not
-- just a display label, and makes voiding/backdating self-correcting
-- instead of needing hand-written unwind algebra with guard conditions.
--
-- Two kinds of cost on a ledger row, from here on:
--  - Ground truth: a receipt's price paid, a bundle component's allocated
--    share, an opening-balance count's admin-entered cost, a regular
--    count's surplus (blended at whatever the average was when that
--    decision was made). These are never recalculated — they're real
--    decisions, kept exactly as recorded.
--  - Derived: a shortfall's cost, or ordinary retail/in-house usage. These
--    were always meant to read "whatever the average is" — recomputing
--    them during a replay to reflect the corrected average as of their own
--    date is exactly what they were always supposed to represent.

-- Combines a business date with the current time-of-day, so the DATE is
-- authoritative for ordering while same-day entries still get a stable,
-- deterministic order relative to each other (by real entry sequence).
create or replace function fn_business_txn_date(p_business_date date)
returns timestamptz language sql stable as $$
  select p_business_date::timestamptz + (clock_timestamp() - clock_timestamp()::date);
$$;

-- The replay engine: rebuilds product_branch_costs and
-- product_branch_cost_history for one (product, branch) from that pair's
-- complete inventory_transactions history, in true business-date order,
-- and re-stamps unit_cost on every "derived" row it passes along the way.
create or replace function fn_recompute_branch_cost(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid
) returns void language plpgsql as $$
declare
  v_row  record;
  v_qty  numeric := 0;
  v_avg  numeric := 0;
  v_is_ground_truth_inflow boolean;
  v_is_derived_usage boolean;
begin
  delete from product_branch_cost_history
  where product_id = p_product_id and branch_id = p_branch_id;

  for v_row in
    select it.id, it.txn_type, it.quantity_change, it.unit_cost, it.txn_date, it.notes
    from inventory_transactions it
    join store_locations sl on sl.id = it.store_location_id
    where it.product_id = p_product_id and sl.branch_id = p_branch_id
    order by it.txn_date asc, it.id asc
  loop
    v_is_ground_truth_inflow :=
      v_row.quantity_change > 0
      and (
        v_row.txn_type = 'goods_receipt'
        or (v_row.txn_type = 'count_adjustment' and v_row.notes = 'Count variance')
      );

    v_is_derived_usage :=
      v_row.txn_type in ('retail_use', 'gwp_use')
      or (v_row.txn_type = 'count_adjustment' and v_row.quantity_change < 0 and v_row.notes = 'Count variance');

    if v_is_ground_truth_inflow then
      if v_qty <= 0 then
        v_avg := coalesce(v_row.unit_cost, 0);
      else
        v_avg := ((v_qty * v_avg) + (v_row.quantity_change * coalesce(v_row.unit_cost, 0))) / (v_qty + v_row.quantity_change);
      end if;
      v_qty := v_qty + v_row.quantity_change;

      insert into product_branch_cost_history (company_id, product_id, branch_id, avg_unit_cost, effective_at)
      values (p_company_id, p_product_id, p_branch_id, v_avg, v_row.txn_date);
    else
      if v_is_derived_usage and v_row.unit_cost is distinct from v_avg then
        update inventory_transactions set unit_cost = v_avg where id = v_row.id;
      end if;
      v_qty := v_qty + v_row.quantity_change;
    end if;
  end loop;

  insert into product_branch_costs (company_id, product_id, branch_id, avg_unit_cost)
  values (p_company_id, p_product_id, p_branch_id, v_avg)
  on conflict (product_id, branch_id) do update set avg_unit_cost = excluded.avg_unit_cost, updated_at = now();
end;
$$;
comment on function fn_recompute_branch_cost is 'Rebuilds one product+branch''s weighted-average cost and history from its full inventory_transactions history, in business-date order. Idempotent — safe to call any time something about that history changes.';

-- Fires after every ledger write, for every write path (receiving, counts,
-- stock-out, bundle migration, voids) alike — the recompute above always
-- wins, so a row inserted out of chronological order slots into the
-- correct position automatically instead of needing bespoke unwind logic.
create or replace function fn_after_inventory_transaction_insert()
returns trigger language plpgsql as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id from store_locations where id = new.store_location_id;
  if v_branch_id is not null then
    perform fn_recompute_branch_cost(new.company_id, new.product_id, v_branch_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_after_inventory_transaction_insert on inventory_transactions;
create trigger trg_after_inventory_transaction_insert
after insert on inventory_transactions
for each row execute function fn_after_inventory_transaction_insert();

-- Receiving now stamps the receipt's own received_date as the ledger date,
-- instead of the moment "Receive" happened to be clicked.
create or replace function fn_after_goods_receipt_item_insert()
returns trigger language plpgsql as $$
declare
  v_company_id          uuid;
  v_branch_id           uuid;
  v_txn_date            timestamptz;
  v_po_id                uuid;
  v_is_set               boolean;
  v_bundle_catalog_cost  numeric;
  v_price_ratio          numeric;
  v_has_components       boolean;
  v_component            record;
  v_component_cost       numeric;
begin
  select gr.company_id, gr.branch_id, fn_business_txn_date(gr.received_date)
    into v_company_id, v_branch_id, v_txn_date
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
        reference_table, reference_id, notes, unit_cost, classification, txn_date
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
        new.classification,
        v_txn_date
      );
    end loop;
  else
    perform fn_apply_goods_receipt_cost(
      v_company_id, new.product_id, v_branch_id, new.quantity_received, new.unit_cost
    );

    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes, unit_cost, classification, txn_date
    ) values (
      v_company_id, new.product_id, new.store_location_id, 'goods_receipt', new.quantity_received,
      'goods_receipt_items', new.id, 'Auto-created on receipt', new.unit_cost, new.classification, v_txn_date
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
comment on function fn_after_goods_receipt_item_insert is 'Automates "receive the correct ordered quantity": writes the ledger entry (unpacking bundles into their components, cost-scaled to the price actually paid this receipt vs. the bundle''s catalog price) dated by the receipt''s own received_date, tracks received qty against the PO line, rolls the PO status forward. Running average cost is now maintained by fn_recompute_branch_cost via the after-insert trigger on inventory_transactions.';

-- Voiding no longer needs its own unwind algebra or "has something newer
-- touched this" guard — it just posts the offsetting quantity, dated now
-- (voiding is a real event happening today), and the recompute trigger
-- above rebuilds the correct average from the corrected history.
create or replace function fn_void_inventory_count(p_count_id uuid)
returns void language plpgsql as $$
declare
  v_company_id uuid;
  v_row        record;
begin
  select company_id into v_company_id from inventory_counts where id = p_count_id;
  if v_company_id is null then
    return;
  end if;

  for v_row in
    select it.product_id, it.store_location_id, it.quantity_change, it.reference_id
    from inventory_transactions it
    where it.txn_type = 'count_adjustment'
      and it.reference_table = 'inventory_count_items'
      and it.notes = 'Count variance'
      and it.reference_id in (select id from inventory_count_items where inventory_count_id = p_count_id)
  loop
    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes
    ) values (
      v_company_id, v_row.product_id, v_row.store_location_id, 'count_adjustment', -v_row.quantity_change,
      'inventory_count_items', v_row.reference_id, 'Voided count'
    );
  end loop;

  update inventory_counts set status = 'voided' where id = p_count_id and status = 'completed';
end;
$$;
comment on function fn_void_inventory_count is 'Reverses a completed count''s ledger quantity exactly. Cost correctness is handled automatically by fn_recompute_branch_cost via the after-insert trigger — no manual unwind or ordering guard needed.';

-- One-time historical correction: every existing row's txn_date moves to
-- reflect the real business date it belongs to (when goods were actually
-- received / a count was actually taken / stock was actually used),
-- keeping each row's original time-of-day as a same-day tiebreak. Only
-- dates and derived cost figures change here — quantities are untouched.
update inventory_transactions it
set txn_date = gr.received_date::timestamptz + (it.txn_date - it.txn_date::date)
from goods_receipt_items gri
join goods_receipts gr on gr.id = gri.goods_receipt_id
where it.reference_table = 'goods_receipt_items'
  and it.reference_id = gri.id
  and gr.received_date is not null;

update inventory_transactions it
set txn_date = ic.count_date::timestamptz + (it.txn_date - it.txn_date::date)
from inventory_count_items ici
join inventory_counts ic on ic.id = ici.inventory_count_id
where it.reference_table = 'inventory_count_items'
  and it.reference_id = ici.id
  and ic.count_date is not null;

update inventory_transactions it
set txn_date = rue.entry_date::timestamptz + (it.txn_date - it.txn_date::date)
from retail_use_entries rue
where it.reference_table = 'retail_use_entries'
  and it.reference_id = rue.id
  and rue.entry_date is not null;

-- Recompute every affected product+branch once, now that dates are correct.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct it.company_id, it.product_id, sl.branch_id
    from inventory_transactions it
    join store_locations sl on sl.id = it.store_location_id
  loop
    perform fn_recompute_branch_cost(v_pair.company_id, v_pair.product_id, v_pair.branch_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
