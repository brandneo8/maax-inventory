-- A balancing amount entered at receiving so a receipt's total matches the
-- supplier's PDF invoice when it was billed in another currency. It's a
-- plain figure (no exchange rates), stored on the receipt rather than the
-- ledger: it moves no stock and doesn't change any product's average cost.
-- Reported as realised FX, separate from cost of goods sold.
alter table goods_receipts add column if not exists fx_adjustment numeric(12,2) not null default 0;
comment on column goods_receipts.fx_adjustment is 'Currency exchange clearing amount that brings the receipt total to the supplier invoice total. Positive = FX loss (extra cost), negative = gain. Not allocated to products and not part of cost of goods sold; reported as realised FX by received_date.';

notify pgrst, 'reload schema';
