-- Persisted, editable POS tag rules — replaces the one-off "select tags,
-- click Include/Exclude, forget what you picked" bulk action. A rule is a
-- saved (tags, allowed) pair; saving it (re-)applies pos_allowed to every
-- product currently matching any of its tags. This is the single source
-- an admin can read later to understand *why* a product is in or out of
-- POS, instead of a bare boolean with no history.
create table if not exists pos_tag_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  label       text,
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table pos_tag_rules is
  'Saved POS allow/exclude rules keyed by tag. Editing and re-saving a rule re-applies it to whatever currently matches its tags -- see pos_tag_rule_tags for the tag set.';

create table if not exists pos_tag_rule_tags (
  rule_id  uuid not null references pos_tag_rules(id) on delete cascade,
  tag_id   uuid not null references tags(id) on delete cascade,
  primary key (rule_id, tag_id)
);

alter table pos_tag_rules enable row level security;
create policy pos_tag_rules_company_isolation on pos_tag_rules
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table pos_tag_rule_tags enable row level security;
create policy pos_tag_rule_tags_company_isolation on pos_tag_rule_tags
  for all using (rule_id in (select id from pos_tag_rules where company_id in (select fn_my_company_ids())))
  with check (rule_id in (select id from pos_tag_rules where company_id in (select fn_my_company_ids())));

notify pgrst, 'reload schema';
