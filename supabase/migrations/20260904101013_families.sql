-- Client households and the people inside them.

create type public.member_relation as enum
  ('self', 'spouse', 'son', 'daughter', 'father', 'mother', 'other');

create table public.families (
  id                 uuid primary key default gen_random_uuid(),
  owner_advisor_id   uuid not null references public.profiles (id) on delete restrict,
  name               text not null,
  head_name          text,
  head_mobile        text,
  notes              text,
  goal_horizon_years int not null default 8,
  assumed_cagr       numeric(5, 2) not null default 12,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint families_goal_horizon_positive check (goal_horizon_years between 1 and 40),
  constraint families_cagr_sane check (assumed_cagr between 0 and 30)
);

comment on column public.families.goal_horizon_years is
  'Goal-gap projection horizon. Per family so different life stages model differently.';

create index families_owner_advisor_id_idx on public.families (owner_advisor_id);

create table public.family_members (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families (id) on delete cascade,
  name                text not null,
  relation            public.member_relation not null default 'other',
  mobile              text,
  whatsapp_consent    boolean not null default false,
  whatsapp_consent_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Consent is meaningless without a number to send to.
  constraint family_members_consent_needs_mobile
    check (not whatsapp_consent or mobile is not null)
);

create index family_members_family_id_idx on public.family_members (family_id);

create trigger families_touch_updated_at
  before update on public.families
  for each row execute function public.touch_updated_at();

create trigger family_members_touch_updated_at
  before update on public.family_members
  for each row execute function public.touch_updated_at();

-- Record when consent was granted, for DPDP evidence.
create or replace function public.stamp_consent_time()
returns trigger
language plpgsql
as $$
begin
  if new.whatsapp_consent and not coalesce(old.whatsapp_consent, false) then
    new.whatsapp_consent_at = now();
  elsif not new.whatsapp_consent then
    new.whatsapp_consent_at = null;
  end if;
  return new;
end;
$$;

create trigger family_members_stamp_consent
  before insert or update on public.family_members
  for each row execute function public.stamp_consent_time();

alter table public.families enable row level security;
alter table public.family_members enable row level security;

create policy families_admin_all on public.families
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy family_members_admin_all on public.family_members
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
