-- One row per holding per due date. Reminders target an instance rather than a
-- holding, which makes "already sent" a unique constraint instead of date maths,
-- and preserves each year's payment status instead of overwriting it.

create type public.payment_status as enum ('paid', 'unpaid', 'unknown');

create table public.due_instances (
  id             uuid primary key default gen_random_uuid(),
  holding_id     uuid not null references public.holdings (id) on delete cascade,
  due_date       date not null,
  -- Copied from holdings.periodic_amount at creation, then frozen: premiums
  -- change between years, and the instance records what was actually owed.
  amount_due     numeric(14, 2),
  payment_status public.payment_status not null default 'unknown',
  paid_on        date,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint due_instances_unique_per_date unique (holding_id, due_date)
);

create index due_instances_due_date_idx on public.due_instances (due_date);
create index due_instances_holding_id_idx on public.due_instances (holding_id);

create trigger due_instances_touch_updated_at
  before update on public.due_instances
  for each row execute function public.touch_updated_at();

alter table public.due_instances enable row level security;

create policy due_instances_admin_all on public.due_instances
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
