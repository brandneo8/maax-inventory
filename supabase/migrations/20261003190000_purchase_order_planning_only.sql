-- Orders saved from the /orders planning page are drafts that stay there:
-- they're kept out of Stock-in (no sending or receiving) for now.
alter table purchase_orders
  add column if not exists planning_only boolean not null default false;
comment on column purchase_orders.planning_only is 'Saved from the /orders planning page — listed there only, never shown in or received through Stock-in.';

notify pgrst, 'reload schema';
