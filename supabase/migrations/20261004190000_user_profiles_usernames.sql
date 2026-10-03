-- Usernames, so admins can add people with a username and password and add
-- their email later. Sign-in still runs on Supabase auth (email + password):
-- a user added without an email gets a placeholder address
-- (<username>@users.pulse.invalid — the reserved .invalid TLD never receives
-- mail) that's replaced when a real email is added. The sign-in form looks
-- the username up here to find the address to sign in with.
create table if not exists user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  created_at timestamptz not null default now()
);
comment on table user_profiles is 'One username per sign-in, used on the login form instead of an email.';
create unique index if not exists user_profiles_username_key on user_profiles (lower(username));

alter table user_profiles enable row level security;
-- People can read their own profile (to show their username); everything
-- else — login lookup, the admin Users page — runs with the service role.
drop policy if exists user_profiles_read_own on user_profiles;
create policy user_profiles_read_own on user_profiles
  for select using (user_id = auth.uid());

-- The default admin's username.
insert into user_profiles (user_id, username)
select id, 'brandonneo' from auth.users where lower(email) = 'brand1998@gmail.com'
on conflict (user_id) do update set username = excluded.username;

notify pgrst, 'reload schema';
