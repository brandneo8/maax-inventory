-- A product sale is a draft until it's confirmed. A draft keeps its lines
-- (products, dates, prices, count links) but has written nothing to the
-- ledger; confirming posts it. Every sale saved before this existed was
-- posted straight away, so they're all confirmed.
alter table product_sales add column if not exists status text not null default 'confirmed';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_sales_status_check') then
    alter table product_sales
      add constraint product_sales_status_check check (status in ('draft', 'confirmed'));
  end if;
end $$;

comment on column product_sales.status is 'draft = saved but not posted to the ledger (no stock or cost effect); confirmed = posted.';

notify pgrst, 'reload schema';
