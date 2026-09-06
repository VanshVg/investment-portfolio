# Milestone 3 — Reminder engine and renewal listing

Status: approved, ready for an implementation plan
Date: 2026-09-06
Builds on: Milestone 1 (schema and auth), Milestone 2 (family ledger CRUD)

## Purpose

Milestone 1 created `due_instances`, `reminder_rules` and `reminder_log`, and the
pure logic that decides *when* a reminder fires and *who* receives it. Nothing
connects them: no code writes `due_instances`, no job runs, and there is no page
for the advisor to work from.

This milestone builds that connective tissue, and stops immediately before the
WhatsApp transport. The engine produces `reminder_log` rows in `pending` and
sends nothing. Milestone 4 adds a sender that drains that queue, so the provider
choice does not block anything here.

## Scope

In:

1. Due-instance generation, on save and on a daily schedule
2. Reconciliation when a holding's schedule is edited
3. The daily sweep: resolve rules, fire windows, route recipients, log
4. Mark-as-renewed, and manual due-date editing
5. The filterable renewal listing page, with pagination
6. The manual payment tick
7. Category-level reminder-rule configuration

Out:

- Sending anything. No provider, no templates, no webhooks.
- Per-holding reminder overrides in the UI (the engine honours them; see
  "Deliberate omissions").
- Client logins, multi-advisor, Excel import.

## Decisions

Each of these was chosen explicitly; the rejected option is recorded because the
reasoning matters more than the conclusion.

### Decision 1. Due instances are real rows, not computed dates

`reminder_log.due_instance_id` is a foreign key, so a reminder cannot be logged
against a date that does not exist as a row. `due_instances.amount_due` is also
deliberately frozen at creation — the schema comment states why: "premiums change
between years, and the instance records what was actually owed." Computing due
dates on the fly would lose both properties.

### Decision 2. Generated on save, topped up daily

One idempotent routine, `ensureDueInstances`, called from two places: the holding
create/update actions, and the daily job.

Rejected: daily-job-only generation. A holding entered in front of a client would
show no due dates until the next run, and the project brief calls out live data
entry as a real workflow. Also rejected: save-only generation, because an
untouched annual policy would eventually run past the end of its generated
horizon and go silent — a failure with no symptom until a renewal is missed.

Idempotency comes from the existing `unique (holding_id, due_date)` constraint,
so re-running the routine is a no-op rather than a duplicate.

### Decision 3. Reconciliation preserves anything the advisor has touched

When a holding's `anchor_due_date`, `next_due_date` or `due_frequency` changes,
future instances for the old schedule are reconciled:

| Instance | Action |
| --- | --- |
| Future, pristine (`payment_status = 'unknown'`, no note, no reminder logged) | Deleted, then regenerated from the new schedule |
| Future, with a payment status, a note, or any `reminder_log` row | Kept, marked off-schedule |
| Past (`due_date < today`) | Never touched, under any circumstance |

A tick, a note or a sent message is evidence. A generated date is not. The
distinction is what makes it safe to regenerate aggressively.

### Decision 4. Mark-as-renewed does both things

One action ticks the instance paid, stamps `paid_on`, and advances the holding's
`next_due_date` by one period. The tick remains independently editable
afterwards, so a mistake is corrected without un-renewing.

A `one_time` holding has no next period — a matured FD does not renew itself. The
action is therefore not offered on those rows at all, rather than offered and
then failing. The payment tick still applies, which is the part that means
something for a maturity.

Rejected: keeping the two fully separate. It handles "renewed but not yet paid"
more precisely, at the cost of making the everyday case two actions on the page
the advisor uses most. The separate tick still covers that case.

### Decision 5. Horizon is 13 months for every frequency

Long enough to cover an annual policy once with a month of slack.

Rejected: capping instances per holding to stop a monthly SIP generating twelve
rows. The cap would silently break the date filter — filtering to a month six
months out would show annual policies and hide SIPs, with nothing on screen to
say why. Row volume is not the real constraint (single-digit thousands at the
expected scale); PostgREST's 1000-row response cap is, and that is solved by
pagination rather than by generating less.

### Decision 6. Scheduled through Vercel Cron, not a database job

A route handler at `/api/cron/reminders`, gated by a shared secret, using the
service-role client.

Chosen because the cadence and routing logic already exists as tested TypeScript
(`domain/reminder-windows.ts`, `domain/routing.ts`). A database-side job would
mean reimplementing both in PL/pgSQL and maintaining two copies of rules that
carry consent obligations.

## Data model changes

One migration. Everything else already exists.

```sql
alter table public.due_instances
  add column off_schedule boolean not null default false;

comment on column public.due_instances.off_schedule is
  'Set when reconciliation preserved this instance because it carried a payment
   status, a note or a logged reminder, but its date is no longer part of the
   holding''s schedule. Cleared if a later edit brings the date back in.';

create index reminder_log_lookup_idx
  on public.reminder_log (due_instance_id, days_before, recipient_type);
```

`off_schedule` is stored rather than derived. Deriving it would mean recomputing
every holding's schedule on every read of the listing page, and the value only
ever changes at reconciliation time, which is exactly where it is written.

## Modules

Each has one purpose, a stated interface, and can be tested without the others.

### `src/lib/domain/due-schedule.ts` (pure)

```ts
function dueDatesBetween(
  anchor: string,        // ISO yyyy-mm-dd
  frequency: DueFrequency,
  from: string,          // ISO yyyy-mm-dd, inclusive
  through: string,       // ISO yyyy-mm-dd, inclusive
): string[]
```

Occurrences on the anchor grid that fall within `[from, through]`.

Uses the existing `nthDueDate` (`anchor + n × step`) rather than repeatedly
adding a period, so month-ends do not drift. `one_time` yields at most the
anchor itself. No database access, no clock — both bounds are passed in.

**The lower bound is not optional.** Without it, a monthly SIP anchored in 2015
would generate around 140 historical instances the first time it is saved.
Callers pass the holding's `next_due_date` as `from`: that is by definition the
first unresolved date, so anything earlier is history this system was not
present for and must not invent. A `next_due_date` already in the past is
included, which is correct — an overdue renewal belongs on the page.

### `src/lib/reminders/ensure-due-instances.ts`

```ts
function ensureDueInstances(
  client: SupabaseClient<Database>,
  holdingId: string,
  through: string,
): Promise<{ created: number; refreshed: number }>
```

Reads the holding, computes the schedule from its `next_due_date` through
`through`, and writes in two steps. The second
step is not optional: an `ignoreDuplicates` upsert by definition leaves existing
rows alone, so it can neither clear `off_schedule` nor refresh an amount.

1. **Insert** the dates that do not exist yet, upserting on
   `(holding_id, due_date)` with `ignoreDuplicates`, taking `amount_due` from the
   holding's current `periodic_amount`.
2. **Update** the rows that already exist and fall in the current schedule,
   setting `off_schedule = false` — a date that has come back into the schedule
   is on it again — and refreshing `amount_due` on rows that are both in the
   future and pristine.

The amount refresh is bounded deliberately. A past instance records what was
actually owed at the time and must never move. A future instance the advisor has
already ticked or annotated is evidence and must not move either. A future
pristine instance is a projection, and the current premium is a better projection
than a stale one.

Generation is **not** gated on `reminders_enabled`: that flag governs whether a
reminder fires, not whether a due date exists. A holding with reminders off still
has due dates, and they still belong on the renewals page.

Skips holdings with no `anchor_due_date`.

`through` is always `today + 13 months`, computed from a single exported constant
so the horizon cannot drift between the save path and the job.

### `src/lib/reminders/reconcile.ts`

```ts
function reconcileDueInstances(
  client: SupabaseClient<Database>,
  holdingId: string,
  through: string,
): Promise<{ deleted: number; preserved: number; created: number }>
```

Implements the Decision 3 table, then calls `ensureDueInstances`. "Pristine" is
determined by a single query joining `reminder_log`, not by three separate
checks, so an instance can never be judged pristine on stale information.

### `src/lib/reminders/sweep.ts`

```ts
function runReminderSweep(
  client: SupabaseClient<Database>,
  today: string,
): Promise<SweepResult>
```

For each due instance in range whose holding has `reminders_enabled`: resolve the
rule (holding override beats category default, inactive rules ignored), call
`firedWindows`, call `reminderRecipients`, and insert a `reminder_log` row per
recipient per fired window with status `pending`.

"In range" is `today` through `today + max(days_before)` across all active rules,
not the full 13-month horizon. An instance further out than the widest configured
window cannot have fired one, so scanning to the horizon would read most of the
table every day to no effect.

The advisor's number comes from the owning family's `owner_advisor_id` →
`profiles.mobile`. This is the first code to read `owner_advisor_id`, and it
makes the deferred decision about scoping RLS to that column easier rather than
harder.

When there are no recipients — an external holding whose advisor has no number
on file, or a self-managed one whose member has not consented — nothing is
written. Absence of a log row means the message was never queued, which is the
honest record.

`today` is a parameter, never `new Date()` inside the function, so the catch-up
and duplicate-suppression behaviour can be tested at any date.

## Data flow

**On save.** `createHolding` / `updateHolding` → `reconcileDueInstances` (create
takes the same path; there is nothing to reconcile, so it reduces to
`ensureDueInstances`) → `revalidatePath`. The advisor sees the due dates
immediately.

**Daily.** Vercel Cron → `/api/cron/reminders` → verify secret → for every
holding, `ensureDueInstances` → `runReminderSweep` → return counts. Both halves
are idempotent, so a retried or duplicated invocation changes nothing.

**Mark renewed.** One server action: set the instance to `paid` with `paid_on =
today`, advance the holding's `next_due_date` one period, then
`ensureDueInstances` so the following date exists at once.

## Failure behaviour

- **A missed daily run self-heals.** `firedWindows` keeps a window firing until
  the due date passes, and `reminder_log`'s unique constraint blocks a second
  send. Catch-up is therefore automatic and cannot double-message anyone.
- **The sweep is per-instance, not all-or-nothing.** One holding with bad data
  must not stop reminders for every other client. Failures are counted and
  returned; the run continues.
- **Writes that RLS or a constraint rejects must not report success.** Every
  new mutation follows the pattern established in Milestone 2: `.select('id')`
  on update and delete, treating an empty array as failure, because Postgres
  applies an RLS `USING` clause to those statements as a row filter rather than
  an error.
- **The cron handler never echoes data.** It runs with the service-role client,
  which bypasses RLS entirely, so its response is counts only.
- **A save whose reconciliation fails still succeeded.** The holding write and
  the instance regeneration are two statements, and the holding is the advisor's
  actual data. If the write lands and reconciliation then fails, the action
  reports success, because it succeeded — reporting failure would be the same
  class of lie the Milestone 2 review found, only inverted. The stale instances
  are repaired by the next daily run, which is the same mechanism that already
  covers a missed run.

## User interface

### `/renewals`

A table sorted by due date with sticky date separators. Columns: due date,
family, member, holding (with category badge), managed-by pill, amount due,
payment tick, action.

External holdings carry the gold/amber treatment from the existing palette —
they are cross-sell triggers rather than servicing work, and that is the one
distinction the page needs to make visually.

Filters, held in the URL as search params so a view is linkable and readable by
the server component without client state:

- Date range: presets (next 30 / 60 / 90 days, this month) plus custom from/to
- Managed by: all / with us / external
- Family, and member within a family

Pagination replaces Milestone 2's truncation banner: offset-based, page size 100,
with an exact count so the page can say "showing 101–200 of 1,340". Ordered by
`(due_date, id)` rather than `due_date` alone — ties on a date are common, and
without a tiebreak the same row can appear on two pages or on neither.

Offset rather than cursor because the page needs jumpable page numbers and a
total, and the depth involved here is trivial. The truncation guard stays as a
backstop rather than being removed.

Each row shows which reminder windows have fired. Until the transport exists
this is the only evidence the engine runs at all, and afterwards it answers
"did that go out?" without a database query.

### Row actions

- **Mark renewed** — one click, per Decision 4.
- **Payment tick** — three-state inline control (paid / unpaid / unknown), no
  modal, consistent with the ledger's inline editing.
- **Off-schedule instances** carry a small gold pill. They are an oddity to
  notice, not an alert, so not the rubber-stamp badge.

No undo stack. The tick stays editable and the due date is directly editable, so
recovery already exists without building one.

### `/settings/reminders`

The four category defaults: `days_before` edited as chips ("30, 15") with an
active toggle. Validation matches the existing check constraints — at least one
window, none negative.

## Deliberate omissions

- **Per-holding reminder overrides have no UI.** The schema supports them and
  the engine resolves them, so adding the control later is small. Building it now
  would be a feature nobody has asked for on a tool whose stated priority is
  speed and few clicks.
- **No reminder history page.** The per-row window indicator covers the question
  that gets asked. A full log view can wait until there is something sent to look
  at.

## Folded-in follow-ups

- **T1 (pagination)** lands here. The follow-ups document records this page as
  its trigger, and building the page without it would mean rebuilding it.
- **T5 (the `23505` mapping)** becomes reachable here: `due_instances` and
  `reminder_log` both carry unique constraints that user action can now hit.

Still deferred, unchanged: the RLS owner-scoping decision, member-level erasure,
consent semantics on a number change, a retention policy, and free-text bounds.

## Testing

- **Unit** — `dueDatesThrough` across all five frequencies, month-end anchors
  (31st into February), leap years, `one_time`, and an anchor already in the past.
- **Integration, against the local database** — `ensureDueInstances` idempotency
  (running twice creates nothing the second time); every row of the D3
  reconciliation table, including the case that must never happen, a past
  instance being deleted; sweep catch-up after a simulated missed day; the
  duplicate-send guard under a repeated run; routing for all four combinations of
  managed-by and consent.
- **End-to-end** — filter the renewals page, mark a holding renewed and see the
  date advance and the next instance appear, set a payment tick and see it
  survive a reload.
- **Security** — the cron route rejects a request with no secret, and one with a
  wrong secret, before doing any work.
