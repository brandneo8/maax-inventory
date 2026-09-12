-- Stored (generated) column so external functions/exports can query availability
-- directly in SQL without recomputing the classification rule each time.
alter table products
  add column if not exists available_in_tunai boolean generated always as (
    coalesce(default_classification in ('retail', 'gwp', 'retail_inhouse'), false)
  ) stored;

comment on column products.available_in_tunai is
  'True when default_classification is retail, gwp, or retail_inhouse (false for inhouse or unset). Auto-derived from default_classification; do not write to it directly.';
