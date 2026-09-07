alter table public.companies
  add column if not exists catalog_saved_at timestamptz;

alter table public.companies
  add column if not exists catalog_saved_by_email text;

comment on column public.companies.catalog_saved_at is
  'When an admin last saved the company catalog from Edit catalog → Done.';

comment on column public.companies.catalog_saved_by_email is
  'Email of the admin who last saved the company catalog from Edit catalog → Done.';
