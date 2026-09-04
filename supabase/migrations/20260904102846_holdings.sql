-- The core record. One table for all four product categories: every cross-cutting
-- feature (reminders, renewal listing, payment ticks, import) is then written once.

create type public.holding_category as enum
  ('life_insurance', 'general_insurance', 'mutual_fund', 'fixed_income');

create type public.managed_by as enum ('self', 'external');

create type public.due_frequency as enum
  ('annual', 'half_yearly', 'quarterly', 'monthly', 'one_time');

create table public.holdings (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  -- Nullable: a health floater covers the household, not one person.
  member_id         uuid references public.family_members (id) on delete set null,
  category          public.holding_category not null,
  managed_by        public.managed_by not null default 'self',
  label             text not null,
  institution       text,
  principal_amount  numeric(14, 2),
  periodic_amount   numeric(14, 2),
  -- Set once, never auto-advanced. Occurrences are anchor + (n * step), so a
  -- policy due on the 31st stays on the 31st instead of drifting after February.
  anchor_due_date   date,
  next_due_date     date,
  due_frequency     public.due_frequency not null default 'annual',
  reminders_enabled boolean not null default true,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.holdings.principal_amount is
  'Value at stake: sum assured, coverage, current value, or invested amount.';
comment on column public.holdings.periodic_amount is
  'Recurring outflow: annual premium, premium, or monthly SIP.';
comment on column public.holdings.details is
  'Category-specific fields, validated by Zod at the server boundary.';

create index holdings_family_id_idx on public.holdings (family_id);
create index holdings_member_id_idx on public.holdings (member_id);
create index holdings_category_idx on public.holdings (category);
create index holdings_managed_by_idx on public.holdings (managed_by);
create index holdings_next_due_date_idx on public.holdings (next_due_date)
  where reminders_enabled;

create trigger holdings_touch_updated_at
  before update on public.holdings
  for each row execute function public.touch_updated_at();

alter table public.holdings enable row level security;

create policy holdings_admin_all on public.holdings
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
