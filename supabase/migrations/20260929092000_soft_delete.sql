-- Decision D2: nothing the advisor deletes is destroyed. Families, members
-- and holdings are hidden by stamping deleted_at, and can be restored.
--
-- Children are not stamped when their parent is: a deleted family hides its
-- members and holdings because every read filters on the family as well, and
-- restoring the family brings back exactly what was there, without having to
-- tell a member deleted on its own from one deleted with the household.
--
-- A soft-deleted member keeps their holdings (member_id is untouched): the
-- policies still exist and still carry reminders, which go to the advisor
-- only, never to the removed member.
--
-- Consequence recorded in docs/follow-ups.md: a genuine DPDP erasure request
-- now needs a separate, deliberate hard-purge path.

alter table public.families add column deleted_at timestamptz;
alter table public.family_members add column deleted_at timestamptz;
alter table public.holdings add column deleted_at timestamptz;

comment on column public.families.deleted_at is
  'Set when the advisor deletes the household (soft delete, decision D2). Hides the family and everything in it; clearing it restores them.';
comment on column public.family_members.deleted_at is
  'Set when the advisor removes the member (soft delete). Their holdings stay attributed to them; reminders for those go to the advisor only.';
comment on column public.holdings.deleted_at is
  'Set when the advisor deletes the holding (soft delete). Hidden from every listing and from the reminder sweep; clearing it restores it.';

-- The listings and the daily sweep read live rows only; these keep that fast
-- as deleted rows accumulate.
create index families_live_idx on public.families (id) where deleted_at is null;
create index family_members_live_idx on public.family_members (family_id) where deleted_at is null;
create index holdings_live_idx on public.holdings (family_id) where deleted_at is null;
