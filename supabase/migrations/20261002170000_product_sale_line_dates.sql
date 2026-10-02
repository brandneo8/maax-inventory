-- Each product-sale line carries its own sale date (on or before its sale's
-- date), mirroring stock-out's per-line use date. A POS report covering a
-- period can then date each line on the day it actually sold, so its
-- retail_use — and its Cost of retail — lands on that day.
alter table product_sale_items add column if not exists sale_date date;
comment on column product_sale_items.sale_date is 'The day this line actually sold — its retail_use ledger date. On or before its product_sales.sale_date.';

-- Lines saved before this column existed sold on their sale's date.
update product_sale_items psi
set sale_date = ps.sale_date
from product_sales ps
where ps.id = psi.product_sale_id and psi.sale_date is null;

alter table product_sale_items alter column sale_date set not null;

notify pgrst, 'reload schema';
