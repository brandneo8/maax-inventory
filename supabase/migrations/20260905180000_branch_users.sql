create table public.branch_users (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (branch_id, user_id)
);

grant select, insert, update, delete on public.branch_users to authenticated;
grant all on public.branch_users to service_role;

alter table public.branch_users enable row level security;
create policy branch_users_company_isolation on public.branch_users
  for all
  using (
    branch_id in (
      select id from public.branches where company_id in (select public.fn_my_company_ids())
    )
  )
  with check (
    branch_id in (
      select id from public.branches where company_id in (select public.fn_my_company_ids())
    )
  );

create or replace function public.fn_grant_default_admin_access(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(p_email, '')) <> 'brand1998@gmail.com' then
    return;
  end if;

  update public.company_users
    set role = 'admin'
    where user_id = p_user_id;

  insert into public.branch_users (branch_id, user_id)
  select b.id, p_user_id
  from public.branches b
  join public.companies c on c.id = b.company_id
  where c.name = 'MAAX PTE LTD'
  on conflict (branch_id, user_id) do nothing;
end;
$$;

create or replace function public.fn_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_users (company_id, user_id, role)
  select id, new.id, 'member'
  from public.companies
  where name = 'MAAX PTE LTD'
  on conflict (company_id, user_id) do nothing;

  perform public.fn_grant_default_admin_access(new.id, new.email);
  return new;
end;
$$;

select public.fn_grant_default_admin_access(u.id, u.email)
from auth.users u
where lower(u.email) = 'brand1998@gmail.com';
