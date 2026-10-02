-- How much of a sale line is applied to the count shortfall it's linked to.
-- A line can sell more (or less) than a shortfall still has to clear, so the
-- applied part — the units the count already took out of stock — is tracked
-- separately from the line's full quantity. Saving writes +linked_quantity
-- back to the count (reclassified as product sale) alongside the line's full
-- -quantity retail use, so stock only drops by the unapplied remainder.
alter table product_sale_items add column if not exists linked_quantity numeric(12,2);
comment on column product_sale_items.linked_quantity is 'Units of this line applied to linked_count_txn_id (the rest of the line is an ordinary deduction). Null when the line isn''t linked.';

-- Lines linked before this column existed applied their whole quantity.
update product_sale_items
set linked_quantity = quantity
where linked_count_txn_id is not null and linked_quantity is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_sale_items_linked_quantity_check'
  ) then
    alter table product_sale_items
      add constraint product_sale_items_linked_quantity_check
      check (
        (linked_count_txn_id is null and linked_quantity is null)
        or (linked_count_txn_id is not null and linked_quantity > 0 and linked_quantity <= quantity)
      );
  end if;
end $$;

notify pgrst, 'reload schema';
