-- Suppliers can be marked inactive (e.g. no longer ordered from) without
-- deleting them; every existing supplier stays active.
alter table suppliers add column if not exists is_active boolean not null default true;
comment on column suppliers.is_active is 'Whether the company still orders from this supplier (set on the Suppliers page).';

notify pgrst, 'reload schema';
