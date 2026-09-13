-- A stock-out is one submission (Retail use or Inhouse use) covering one or
-- more retail_use_entries lines, all sharing the same date/reference/notes/type.
create table if not exists stock_out_reports (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  branch_id          uuid not null references branches(id),
  channel            text not null check (channel in ('retail', 'inhouse')),
  entry_date         date not null,
  external_reference text,
  notes              text,
  keyed_in_by        text,
  created_at         timestamptz not null default now()
);
comment on table stock_out_reports is 'One stock-out submission (Retail use or Inhouse use) covering one or more retail_use_entries lines, all sharing the same date/reference/notes/type.';
comment on column stock_out_reports.channel is 'retail = Retail + GWP use (products tagged retail or gwp for this branch); inhouse = Inhouse use (products tagged inhouse for this branch).';

alter table retail_use_entries add column if not exists stock_out_report_id uuid references stock_out_reports(id) on delete cascade;

alter table stock_out_reports enable row level security;
drop policy if exists stock_out_reports_company_isolation on stock_out_reports;
create policy stock_out_reports_company_isolation on stock_out_reports
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

grant select, insert, update, delete on public.stock_out_reports to authenticated;
grant all on public.stock_out_reports to service_role;

create index if not exists idx_stock_out_reports_branch on stock_out_reports (branch_id, created_at desc);
create index if not exists idx_retail_use_entries_report on retail_use_entries (stock_out_report_id);

notify pgrst, 'reload schema';
