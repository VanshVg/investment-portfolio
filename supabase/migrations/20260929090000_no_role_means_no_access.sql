-- There is one admin, created deliberately by the seed script with role
-- 'admin' in its metadata. Until now an account created without any role
-- defaulted to admin, so any future sign-up path that forgot to say what the
-- account was would have minted full access to every household. An absent
-- role now means 'client', which has no access under the current policies.
-- An unrecognised role still fails loudly, as before.

alter table public.profiles alter column role set default 'client';

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
    resolved_role := 'client';
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
