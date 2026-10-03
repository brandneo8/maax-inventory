-- Table privileges for user_profiles (row access is still limited by RLS:
-- signed-in users read only their own row; the service role does the rest).
grant select, insert, update, delete on user_profiles to service_role;
grant select on user_profiles to authenticated;

notify pgrst, 'reload schema';
