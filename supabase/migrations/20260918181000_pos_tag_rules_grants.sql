-- 20260918180000_pos_tag_rules.sql enabled RLS with company-isolation
-- policies but never granted base table privileges -- RLS filters rows,
-- it doesn't substitute for the underlying GRANT, so every role (even
-- service_role) was denied outright. Every other table in this schema
-- already has this grant from the project's original setup; these two
-- new tables need it explicitly since they weren't part of that.
grant select, insert, update, delete on table pos_tag_rules to authenticated, service_role;
grant select, insert, update, delete on table pos_tag_rule_tags to authenticated, service_role;

notify pgrst, 'reload schema';
