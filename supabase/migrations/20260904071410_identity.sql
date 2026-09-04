-- Roles, the advisor profile that extends auth.users, and the RLS foundation
-- every later table depends on.

create type public.user_role as enum ('admin', 'staff', 'client');

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       public.user_role not null default 'admin',
  mobile     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.mobile is
  'The advisor''s own WhatsApp number — the advisor-side reminder recipient.';

alter table public.profiles enable row level security;

-- Shared updated_at trigger, reused by every table in later migrations.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- SECURITY DEFINER so that policies on profiles can query profiles
-- without recursively re-evaluating those same policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- A user may read and update only their own profile.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- A user may edit their own profile but not their own role. RLS cannot gate
-- individual columns, so column privileges do it: this is what stops a future
-- client login from promoting itself to admin.
revoke update on public.profiles from authenticated;
grant update (full_name, mobile) on public.profiles to authenticated;

-- Every auth user gets a profile. Role travels in user metadata at creation.
-- An absent role defaults to 'admin' (today's only caller, the seed script,
-- relies on this). A present-but-unrecognized role is a programming error at
-- the call site, not something to silently coerce, so it fails loudly with
-- a message naming the bad value and the valid set — read from pg_enum so
-- adding a fourth role later never requires touching this function.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  resolved_role public.user_role;
begin
  if requested_role is null then
    resolved_role := 'admin';
  else
    begin
      resolved_role := requested_role::public.user_role;
    exception when invalid_text_representation then
      raise exception 'invalid role %: must be one of %',
        quote_literal(requested_role),
        (select string_agg(enumlabel, ', ' order by enumsortorder)
         from pg_enum
         where enumtypid = 'public.user_role'::regtype);
    end;
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    resolved_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
