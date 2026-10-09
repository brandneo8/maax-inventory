-- Stock-out saves as single transactions. The app works out the lines and
-- their ledger rows (bundle contents, current average cost, ledger dates);
-- these functions do every write for one save at once, so a failure leaves
-- nothing half-saved. Saves for one salon run one at a time (an advisory
-- lock), and the active-count and period checks are repeated inside the
-- lock, so two people saving together can't overlap periods.
-- New functions only: no table, column or row changes.

/** Raises if a count is in progress at the salon (same rule as the app's assertNoActiveCount). */
create or replace function fn_stock_out_assert_no_active_count(p_company_id uuid, p_branch_id uuid)
returns void language plpgsql as $$
begin
  if exists (
    select 1 from inventory_counts
    where company_id = p_company_id and branch_id = p_branch_id and status = 'in_progress'
  ) then
    raise exception 'An inventory count is currently in progress for this salon. Complete or void it before you record stock-out.';
  end if;
end;
$$;

/** Takes the salon's stock-out lock until the transaction ends. */
create or replace function fn_stock_out_lock(p_branch_id uuid)
returns void language sql as $$
  select pg_advisory_xact_lock(hashtextextended('stock_out:' || p_branch_id::text, 0));
$$;

/**
 * Creates (p_is_new) or updates a stock-out report and its lines.
 * - p_keep_entry_ids: on update, the existing lines left exactly as they were;
 *   they keep their ids, ledger rows and count-coverage links. Every other
 *   existing line is removed with all its ledger rows.
 * - p_entries: new lines [{id, product_id, quantity_used, entry_date}].
 * - p_txns: their stock deductions [{reference_id, product_id, quantity_change,
 *   notes, unit_cost, txn_date}] (bundles already unpacked into contents).
 * Returns the period start.
 */
create or replace function fn_save_stock_out(
  p_company_id uuid,
  p_branch_id uuid,
  p_report_id uuid,
  p_is_new boolean,
  p_entry_date date,
  p_notes text,
  p_user text,
  p_store_location_id uuid,
  p_keep_entry_ids uuid[],
  p_entries jsonb,
  p_txns jsonb
) returns date language plpgsql as $$
declare
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_start date;
  v_max_end date;
  v_current_end date;
  v_next_start date;
  v_removed uuid[];
  v_products uuid[];
  v_product uuid;
  v_base_note text := coalesce(p_notes, 'Stock-out (inhouse)');
begin
  perform fn_stock_out_lock(p_branch_id);
  perform fn_stock_out_assert_no_active_count(p_company_id, p_branch_id);

  if p_is_new then
    select max(entry_date) + 1 into v_start
    from stock_out_reports where company_id = p_company_id and branch_id = p_branch_id;
    v_start := coalesce(v_start, date '2026-06-01');
    v_max_end := v_today;
    if v_start > v_max_end then
      raise exception 'The last stock-out already covers up to today — the next one can start on %.', to_char(v_start, 'FMDD Mon YYYY');
    end if;
  else
    select coalesce(period_start, entry_date), entry_date into v_start, v_current_end
    from stock_out_reports
    where id = p_report_id and company_id = p_company_id and branch_id = p_branch_id
    for update;
    if not found then
      raise exception 'Stock-out not found.';
    end if;
    select min(coalesce(period_start, entry_date)) into v_next_start
    from stock_out_reports
    where company_id = p_company_id and branch_id = p_branch_id and id <> p_report_id
      and coalesce(period_start, entry_date) > v_current_end;
    -- A later stock-out starts the day after this one ends: moving the end
    -- either way would overlap it or leave days no stock-out can cover.
    if v_next_start is not null and p_entry_date <> v_current_end then
      raise exception 'This stock-out''s end date can''t change: the next stock-out starts on %.', to_char(v_next_start, 'FMDD Mon YYYY');
    end if;
    v_max_end := least(v_today, coalesce(v_next_start - 1, v_today));
  end if;

  if p_entry_date < v_start then
    raise exception 'The end date can''t be before the period start, %.', to_char(v_start, 'FMDD Mon YYYY');
  end if;
  if p_entry_date > v_max_end then
    raise exception 'The end date can''t be after %.', to_char(v_max_end, 'FMDD Mon YYYY');
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_entries) as x(entry_date date)
    where x.entry_date is null or x.entry_date < v_start or x.entry_date > p_entry_date
  ) or exists (
    select 1 from retail_use_entries
    where stock_out_report_id = p_report_id and id = any(coalesce(p_keep_entry_ids, '{}'))
      and (entry_date < v_start or entry_date > p_entry_date)
  ) then
    raise exception 'Open dates have to be between % and % — this stock-out''s period.',
      to_char(v_start, 'FMDD Mon YYYY'), to_char(p_entry_date, 'FMDD Mon YYYY');
  end if;
  if exists (select 1 from jsonb_to_recordset(p_entries) as x(quantity_used numeric) where x.quantity_used is null or x.quantity_used <= 0) then
    raise exception 'Each line needs a quantity above zero.';
  end if;

  if p_is_new then
    insert into stock_out_reports (id, company_id, branch_id, channel, period_start, entry_date, notes, keyed_in_by)
    values (p_report_id, p_company_id, p_branch_id, 'inhouse', v_start, p_entry_date, p_notes, p_user);
  else
    -- Lines not kept: their deductions and any count reclassification go with them.
    select array_agg(id) into v_removed
    from retail_use_entries
    where stock_out_report_id = p_report_id and not (id = any(coalesce(p_keep_entry_ids, '{}')));

    if v_removed is not null then
      with deleted as (
        delete from inventory_transactions
        where reference_table = 'retail_use_entries' and reference_id = any(v_removed)
        returning product_id
      )
      select array_agg(distinct product_id) into v_products from deleted;
      delete from retail_use_entries where id = any(v_removed);
    end if;

    update stock_out_reports
    set channel = 'inhouse', period_start = v_start, entry_date = p_entry_date, notes = p_notes
    where id = p_report_id;

    -- Kept lines take the report's notes, as new lines do.
    update retail_use_entries set notes = p_notes
    where stock_out_report_id = p_report_id and id = any(coalesce(p_keep_entry_ids, '{}'));
    update inventory_transactions
    set notes = v_base_note || case when notes like '% (unpacked from bundle usage)' then ' (unpacked from bundle usage)' else '' end
    where reference_table = 'retail_use_entries'
      and reference_id = any(coalesce(p_keep_entry_ids, '{}'))
      and txn_type = 'inhouse_use';
  end if;

  insert into retail_use_entries (
    id, company_id, branch_id, product_id, store_location_id, quantity_used, entry_date,
    keyed_in_by, notes, stock_out_report_id
  )
  select x.id, p_company_id, p_branch_id, x.product_id, p_store_location_id, x.quantity_used, x.entry_date,
    p_user, p_notes, p_report_id
  from jsonb_to_recordset(p_entries) as x(id uuid, product_id uuid, quantity_used numeric, entry_date date);

  insert into inventory_transactions (
    company_id, product_id, store_location_id, txn_type, quantity_change, reference_table, reference_id,
    created_by, notes, unit_cost, classification, txn_date
  )
  select p_company_id, t.product_id, p_store_location_id, 'inhouse_use', t.quantity_change, 'retail_use_entries',
    t.reference_id, p_user, t.notes, t.unit_cost, 'inhouse', t.txn_date
  from jsonb_to_recordset(p_txns) as t(
    reference_id uuid, product_id uuid, quantity_change numeric, notes text, unit_cost numeric, txn_date timestamptz
  );

  -- Deleting ledger rows doesn't fire the cost trigger: replay those products once each.
  foreach v_product in array coalesce(v_products, '{}') loop
    perform fn_recompute_branch_cost(p_company_id, v_product, p_branch_id);
  end loop;

  return v_start;
end;
$$;

/** Deletes a stock-out report with its lines and every ledger row they wrote. */
create or replace function fn_delete_stock_out(p_company_id uuid, p_branch_id uuid, p_report_id uuid)
returns void language plpgsql as $$
declare
  v_end date;
  v_entries uuid[];
  v_products uuid[];
  v_product uuid;
begin
  perform fn_stock_out_lock(p_branch_id);
  perform fn_stock_out_assert_no_active_count(p_company_id, p_branch_id);

  select entry_date into v_end
  from stock_out_reports
  where id = p_report_id and company_id = p_company_id and branch_id = p_branch_id
  for update;
  if not found then
    raise exception 'Stock-out not found.';
  end if;
  -- Only the latest can go: removing an earlier one would leave days no stock-out can cover.
  if exists (
    select 1 from stock_out_reports
    where company_id = p_company_id and branch_id = p_branch_id and id <> p_report_id and entry_date > v_end
  ) then
    raise exception 'Only the latest stock-out can be deleted — a later stock-out starts after this one.';
  end if;

  select array_agg(id) into v_entries from retail_use_entries where stock_out_report_id = p_report_id;
  if v_entries is not null then
    with deleted as (
      delete from inventory_transactions
      where reference_table = 'retail_use_entries' and reference_id = any(v_entries)
      returning product_id
    )
    select array_agg(distinct product_id) into v_products from deleted;
    delete from retail_use_entries where id = any(v_entries);
  end if;
  delete from stock_out_reports where id = p_report_id;

  foreach v_product in array coalesce(v_products, '{}') loop
    perform fn_recompute_branch_cost(p_company_id, v_product, p_branch_id);
  end loop;
end;
$$;

/**
 * Marks a stock-out line as covered by a count shortfall (p_link_txn_id set):
 * a +qty count_adjustment on the count's date with the note the cost engine
 * keys off, and the link on the line. With p_link_txn_id null it goes back to
 * an extra deduction. Any earlier reclassification for the line is always
 * removed first, so it can't be added back twice.
 */
create or replace function fn_set_stock_out_line_link(
  p_company_id uuid,
  p_branch_id uuid,
  p_entry_id uuid,
  p_link_txn_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_txn_date timestamptz,
  p_store_location_id uuid,
  p_user text
) returns void language plpgsql as $$
declare
  v_product uuid;
begin
  perform fn_stock_out_lock(p_branch_id);
  perform fn_stock_out_assert_no_active_count(p_company_id, p_branch_id);

  select product_id into v_product
  from retail_use_entries
  where id = p_entry_id and company_id = p_company_id and branch_id = p_branch_id
  for update;
  if not found then
    raise exception 'Stock-out line not found.';
  end if;

  delete from inventory_transactions
  where reference_table = 'retail_use_entries' and reference_id = p_entry_id
    and notes = 'Reclassified as in-house use';
  update retail_use_entries set linked_count_txn_id = null, linked_quantity = null where id = p_entry_id;

  if p_link_txn_id is not null then
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'That count has no shortfall left for this product to cover the line.';
    end if;
    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change, reference_table, reference_id,
      created_by, notes, unit_cost, txn_date
    ) values (
      p_company_id, v_product, p_store_location_id, 'count_adjustment', p_quantity, 'retail_use_entries',
      p_entry_id, p_user, 'Reclassified as in-house use', p_unit_cost, p_txn_date
    );
    update retail_use_entries set linked_count_txn_id = p_link_txn_id, linked_quantity = p_quantity
    where id = p_entry_id;
  end if;

  perform fn_recompute_branch_cost(p_company_id, v_product, p_branch_id);
end;
$$;

grant execute on function fn_stock_out_assert_no_active_count(uuid, uuid) to authenticated, service_role;
grant execute on function fn_stock_out_lock(uuid) to authenticated, service_role;
grant execute on function fn_save_stock_out(uuid, uuid, uuid, boolean, date, text, text, uuid, uuid[], jsonb, jsonb) to authenticated, service_role;
grant execute on function fn_delete_stock_out(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function fn_set_stock_out_line_link(uuid, uuid, uuid, uuid, numeric, numeric, timestamptz, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
