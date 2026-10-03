-- Who sent a /orders planning draft to the supplier, typed in when it's
-- marked sent; cleared again if it's marked unsent.
alter table purchase_orders
  add column if not exists sent_by text;
comment on column purchase_orders.sent_by is 'Name entered when a /orders draft is marked sent; cleared when it''s marked unsent.';

notify pgrst, 'reload schema';
