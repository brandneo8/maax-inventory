-- Whether a product may appear in the POS system is now a manual,
-- admin-level (company-wide, not per-branch) decision, made on the new
-- /pos page — not derived from classification. This is a brand-new
-- column: the existing products.available_in_tunai is legacy/frozen
-- (trigger-maintained from a table the app no longer writes to; the
-- comment on it already says not to write to it directly) and is left
-- alone rather than repurposed or dropped.
alter table products add column if not exists pos_allowed boolean not null default false;

comment on column products.pos_allowed is
  'Manually set by an admin on /pos. True = eligible to appear in the POS system for any branch it is assigned to. Not derived from classification or tags after creation.';

-- One-time backfill for every product that exists today: seed from the
-- same rule /home/tunai used to compute live (retail, gwp, or
-- retail_inhouse at any branch), so nothing changes functionally on day
-- one -- admins adjust from /pos going forward.
update products p
set pos_allowed = true
where exists (
  select 1
  from product_branch_classifications pbc
  where pbc.product_id = p.id
    and pbc.classification in ('retail', 'gwp', 'retail_inhouse')
);

-- Then force-exclude anything tagged "colour" right now, per the new
-- policy -- overrides the seed above for those specific products.
update products p
set pos_allowed = false
where exists (
  select 1
  from product_tags pt
  join tags t on t.id = pt.tag_id
  where pt.product_id = p.id
    and lower(trim(t.name)) = 'colour'
);

notify pgrst, 'reload schema';
