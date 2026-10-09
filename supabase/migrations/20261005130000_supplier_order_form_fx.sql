-- Order forms priced in another currency (e.g. Medavita in RM): the form's
-- currency and the rate to convert its prices to SGD for the comparison.
-- currency null = not set (treated as SGD); fx_rate = SGD per 1 unit of currency.
alter table supplier_order_forms add column if not exists currency text;
alter table supplier_order_forms add column if not exists fx_rate numeric(14, 6);
comment on column supplier_order_forms.currency is 'The currency the order form''s prices are in (ISO code, e.g. MYR); null = SGD.';
comment on column supplier_order_forms.fx_rate is 'SGD per 1 unit of currency, used to convert the form''s price and RRP; null when the form is in SGD.';

notify pgrst, 'reload schema';
