-- Stock-outs only need Notes; drop the separate Reference field and its data.
alter table stock_out_reports drop column if exists external_reference;

notify pgrst, 'reload schema';
