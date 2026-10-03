-- Who asked for the products on a /orders planning draft, typed in when the
-- order is saved.
alter table purchase_orders
  add column if not exists requested_by text;
comment on column purchase_orders.requested_by is 'Name of the person requesting the products, entered when a /orders draft is saved.';

notify pgrst, 'reload schema';
