-- Milestone 4: the WhatsApp sender. Everything here ships inert: the mode
-- starts 'off', and nothing sends until the Meta credentials exist in the
-- environment and the advisor switches the mode in Settings.

-- One row of application settings. The check on a boolean primary key is
-- what makes it one row: the only value the key may hold is true.
create type public.whatsapp_mode as enum ('off', 'test', 'live');

create table public.app_settings (
  id             boolean primary key default true check (id),
  whatsapp_mode  public.whatsapp_mode not null default 'off',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id) on delete set null
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

create policy app_settings_admin_read on public.app_settings
  for select to authenticated
  using ((select public.is_admin()));

create policy app_settings_admin_update on public.app_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke insert, delete, update on public.app_settings from anon, authenticated;
grant update (whatsapp_mode, updated_at, updated_by) on public.app_settings to authenticated;

-- The sender's working states. 'sending' is a claim: a row in it has been
-- taken by one run and must not be sent by another. 'delivered' and 'read'
-- arrive later, from Meta's webhook.
alter type public.reminder_status add value 'sending';
alter type public.reminder_status add value 'delivered';
alter type public.reminder_status add value 'read';

alter table public.reminder_log
  add column skip_reason        text,
  add column attempts           int not null default 0,
  add column claimed_at         timestamptz,
  add column delivered_at       timestamptz,
  add column read_at            timestamptz,
  add column test_sent_at       timestamptz,
  -- Advisor rows are covered by one daily summary message; every row it
  -- covered carries its id, so its delivery status reaches all of them.
  add column summary_message_id text;

create index reminder_log_status_idx on public.reminder_log (status);
create index reminder_log_provider_message_id_idx on public.reminder_log (provider_message_id);
create index reminder_log_summary_message_id_idx on public.reminder_log (summary_message_id);

-- Messages clients send back. Admin-only: they are client personal data.
create table public.whatsapp_inbound (
  id                  uuid primary key default gen_random_uuid(),
  from_mobile         text not null,
  body                text not null,
  -- Meta may deliver the same webhook more than once; the message is stored once.
  provider_message_id text not null unique,
  received_at         timestamptz not null default now(),
  member_ids          uuid[] not null default '{}',
  opt_out             boolean not null default false,
  handled_at          timestamptz,
  handled_by          uuid references public.profiles (id) on delete set null
);

create index whatsapp_inbound_received_at_idx on public.whatsapp_inbound (received_at desc);

alter table public.whatsapp_inbound enable row level security;

create policy whatsapp_inbound_admin_read on public.whatsapp_inbound
  for select to authenticated
  using ((select public.is_admin()));

create policy whatsapp_inbound_admin_update on public.whatsapp_inbound
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke insert, delete, update on public.whatsapp_inbound from anon, authenticated;
grant update (handled_at, handled_by) on public.whatsapp_inbound to authenticated;

-- Who changed consent: the advisor in the app, or the client by replying
-- STOP. DPDP needs a withdrawal to be demonstrable, and "the client asked"
-- is the stronger record.
create type public.consent_source as enum ('advisor', 'client_reply');

alter table public.consent_events
  add column source public.consent_source not null default 'advisor';

-- As before, plus the source: read from a transaction-local setting that
-- only withdraw_consent_by_reply sets. Unset means the advisor.
create or replace function public.record_consent_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind public.consent_event;
  number text;
  origin public.consent_source :=
    coalesce(nullif(current_setting('app.consent_source', true), ''), 'advisor')::public.consent_source;
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
    insert into public.consent_events (member_id, event, mobile, recorded_by, source)
    values (new.id, kind, number, auth.uid(), origin);
  end if;
  return new;
end;
$$;

-- A client replied STOP. Consent goes off for every live member with that
-- number (one phone can belong to several family members), and the trigger
-- records each withdrawal as the client's own. Only the service role — the
-- webhook — may call it.
create or replace function public.withdraw_consent_by_reply(p_mobile text)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.consent_source', 'client_reply', true);
  return query
    update public.family_members
       set whatsapp_consent = false
     where mobile = p_mobile
       and whatsapp_consent
       and deleted_at is null
    returning id;
  perform set_config('app.consent_source', '', true);
end;
$$;

revoke execute on function public.withdraw_consent_by_reply(text) from public, anon, authenticated;
grant execute on function public.withdraw_consent_by_reply(text) to service_role;
