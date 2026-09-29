-- DPDP s.6 requires the fiduciary to be able to demonstrate that consent was
-- obtained. family_members.whatsapp_consent_at holds only the current
-- consent's time and is cleared on withdrawal, so on its own it erased the
-- evidence — including for messages already sent under that consent.
-- consent_events is the history beside it: append-only, written by the
-- database itself, readable by the admin, and never edited or deleted.

create type public.consent_event as enum ('given', 'withdrawn', 'mobile_changed');

create table public.consent_events (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.family_members (id) on delete cascade,
  event        public.consent_event not null,
  -- The number the event applies to: the one consent was given for, the one
  -- it was withdrawn from, or the new one it now covers.
  mobile       text,
  recorded_at  timestamptz not null default now(),
  recorded_by  uuid references public.profiles (id) on delete set null
);

comment on table public.consent_events is
  'Append-only history of WhatsApp consent per member: given, withdrawn, and number changes while consented (consent is kept across a number change by decision D3). Written only by the record_consent_event trigger.';

create index consent_events_member_idx on public.consent_events (member_id, recorded_at);

alter table public.consent_events enable row level security;

create policy consent_events_admin_read on public.consent_events
  for select to authenticated
  using ((select public.is_admin()));

-- No insert, update or delete for anyone but the trigger: evidence that can
-- be edited is not evidence.
revoke insert, update, delete on public.consent_events from anon, authenticated;

create or replace function public.record_consent_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind public.consent_event;
  number text;
begin
  if tg_op = 'INSERT' then
    if new.whatsapp_consent then
      kind := 'given';
      number := new.mobile;
    end if;
  elsif new.whatsapp_consent and not old.whatsapp_consent then
    kind := 'given';
    number := new.mobile;
  elsif old.whatsapp_consent and not new.whatsapp_consent then
    kind := 'withdrawn';
    number := old.mobile;
  elsif new.whatsapp_consent and new.mobile is distinct from old.mobile then
    kind := 'mobile_changed';
    number := new.mobile;
  end if;

  if kind is not null then
    insert into public.consent_events (member_id, event, mobile, recorded_by)
    values (new.id, kind, number, auth.uid());
  end if;
  return new;
end;
$$;

create trigger family_members_record_consent
  after insert or update of whatsapp_consent, mobile on public.family_members
  for each row execute function public.record_consent_event();

-- The consent time belongs to the database. Previously a true -> true update
-- let a caller write any whatsapp_consent_at through PostgREST; it now keeps
-- the time consent was actually given.
create or replace function public.stamp_consent_time()
returns trigger
language plpgsql
as $$
begin
  if new.whatsapp_consent and not coalesce(old.whatsapp_consent, false) then
    new.whatsapp_consent_at = now();
  elsif new.whatsapp_consent then
    new.whatsapp_consent_at = old.whatsapp_consent_at;
  else
    new.whatsapp_consent_at = null;
  end if;
  return new;
end;
$$;
