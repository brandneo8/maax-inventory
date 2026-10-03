-- FX clearing amount entered on a draft order, before it's received. It's a
-- planning figure only: receiving pre-fills the receipt's fx_adjustment from
-- it, and only the receipt's amount is reported as realised FX.
alter table purchase_orders add column if not exists fx_adjustment numeric(12,2) not null default 0;
comment on column purchase_orders.fx_adjustment is 'FX clearing amount entered while the order is a draft; pre-fills the receipt''s fx_adjustment on receiving. Not reported itself — realised FX comes from goods_receipts.fx_adjustment.';

notify pgrst, 'reload schema';
