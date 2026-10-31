-- Configurable reminder windows and the send log. No engine yet.

-- One value today. An enum so adding SMS or email later is an enum extension
-- rather than a schema change.
create type public.reminder_channel as enum ('whatsapp');
create type public.reminder_recipient_type as enum ('advisor', 'client');
create type public.reminder_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.reminder_rules (
  id          uuid primary key default gen_random_uuid(),
  category    public.holding_category,
  holding_id  uuid references public.holdings (id) on delete cascade,
  days_before int[] not null,
  channel     public.reminder_channel not null default 'whatsapp',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A rule is exactly one of the two: a category default or a holding override.
  constraint reminder_rules_exactly_one_scope
    check ((category is not null) <> (holding_id is not null)),
  constraint reminder_rules_days_before_present
    check (array_length(days_before, 1) >= 1),
  constraint reminder_rules_days_before_non_negative
    check (0 <= all (days_before))
);

comment on table public.reminder_rules is
  'Cadence is data, not code. Changing a window must never require a deploy.';

create unique index reminder_rules_one_active_per_category
  on public.reminder_rules (category)
  where is_active and category is not null;

create unique index reminder_rules_one_active_per_holding
  on public.reminder_rules (holding_id)
  where is_active and holding_id is not null;

create table public.reminder_log (
  id                  uuid primary key default gen_random_uuid(),
  due_instance_id     uuid not null references public.due_instances (id) on delete cascade,
  days_before         int not null,
  recipient_type      public.reminder_recipient_type not null,
  -- Snapshot: numbers change, and the log must record where the message went.
  recipient_mobile    text not null,
  channel             public.reminder_channel not null default 'whatsapp',
  status              public.reminder_status not null default 'pending',
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  -- The duplicate-send guard. Enforced here rather than in application logic so
  -- a retried or concurrent job cannot message a client twice.
  constraint reminder_log_one_send_per_window
    unique (due_instance_id, days_before, recipient_type)
);

create index reminder_log_due_instance_id_idx on public.reminder_log (due_instance_id);

create trigger reminder_rules_touch_updated_at
  before update on public.reminder_rules
  for each row execute function public.touch_updated_at();

alter table public.reminder_rules enable row level security;
alter table public.reminder_log enable row level security;

create policy reminder_rules_admin_all on public.reminder_rules
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy reminder_log_admin_all on public.reminder_log
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Starting cadence, pending the advisor's decision. Editable without a deploy.
insert into public.reminder_rules (category, days_before)
values
  ('life_insurance',    '{30,15}'),
  ('general_insurance', '{30,15}'),
  ('mutual_fund',       '{30,15}'),
  ('fixed_income',      '{30,15}');
