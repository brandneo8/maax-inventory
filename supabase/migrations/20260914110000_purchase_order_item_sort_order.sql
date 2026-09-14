-- Manual display order for purchase order line items, set by drag-and-drop
-- reordering in the UI and persisted whenever the draft order is saved.
alter table purchase_order_items add column if not exists sort_order integer not null default 0;
comment on column purchase_order_items.sort_order is 'Manual display order for line items on a purchase order, set by drag-and-drop reordering in the UI.';

notify pgrst, 'reload schema';
