-- The baseline migration granted table privileges to `authenticated`/`service_role`
-- only on tables that existed at the time. New tables need their own grant.
grant select, insert, update, delete on public.product_classifications to authenticated;
grant all on public.product_classifications to service_role;

-- Make sure PostgREST picks up the new table/relationship immediately.
notify pgrst, 'reload schema';
