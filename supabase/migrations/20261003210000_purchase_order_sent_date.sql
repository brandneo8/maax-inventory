-- The date a planning draft (saved on /orders) was sent to its supplier,
-- entered by the user when they mark it sent.
alter table purchase_orders
  add column if not exists sent_date date;
comment on column purchase_orders.sent_date is 'Date the order was sent to the supplier, entered when a /orders draft is marked sent.';

notify pgrst, 'reload schema';
