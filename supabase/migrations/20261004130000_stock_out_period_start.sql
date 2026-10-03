-- Stock-outs cover back-to-back periods so in-house use can't be logged
-- twice: each report runs from period_start to its end date (entry_date),
-- and the next one starts the day after. The first starts on the salon's
-- opening day.
alter table stock_out_reports
  add column if not exists period_start date;
comment on column stock_out_reports.period_start is 'First day this stock-out covers; it ends on entry_date. The day after the previous stock-out''s entry_date (or the salon''s opening day for the first).';

notify pgrst, 'reload schema';
