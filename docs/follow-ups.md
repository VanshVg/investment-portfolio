# Open follow-ups

Found during the Milestone 2 pre-merge review, verified against the code as merged,
and left alone on purpose. Each entry says why it was left, and what makes it urgent again.

D1–D4 were **decisions, not tickets**. All four were taken on 2026-09-29; each
entry below records the answer and what was built for it.

---

## D1. RLS is "any admin", not "the advisor who owns this family" — decided

**Decision:** keep it. There will only ever be one admin, so "any admin sees every
family" is exactly right, and scoping policies to `owner_advisor_id` would add
nothing. Revisit only if a second advisor login is ever introduced.

**Hardening done** (`20260929090000_no_role_means_no_access.sql`): an account
created without a role used to default to `admin`, so a future sign-up path that
forgot to set the role would have minted full access. It now defaults to
`client`, which has no access. The seed script sets `admin` explicitly.

---

## D2. Deleting a family member is not erasure — decided: soft delete, everywhere

**Decision:** nothing is destroyed. Families, members and holdings are
soft-deleted (`deleted_at`, `20260929092000_soft_delete.sql`) and stay in the
database. The advisor has no screen for them (a **Deleted items** page existed
briefly and was removed at the advisor's request); a record is restored by
clearing its `deleted_at` in the database — see "Restoring a deleted record"
in `docs/deployment.md`.

- Every read filters deleted rows out: the families list and its counts, the
  workspace, the renewals and overdue listings, the daily cron's holding list,
  and the reminder sweep. `tests/integration/soft-delete.test.ts` deletes one of
  each and checks every one of those places, the sweep included.
- A deleted household's members and holdings are not stamped themselves; the
  family's stamp hides them, so a restore brings back exactly what was there.
- A removed member keeps their holdings (shown as "Name (removed)"), and the
  sweep treats them as absent: reminders for those holdings go to the advisor
  only. A removed member cannot be newly assigned to a holding.

**What this leaves open — see T14:** a genuine DPDP erasure request can no
longer be served from the app at all, because the app no longer destroys data.

---

## D3. WhatsApp consent semantics when a mobile number changes — decided

**Decision:** consent is kept when the number changes (the existing behaviour).

**The two uncontested sub-points are done** (`20260929091000_consent_history.sql`):

- Withdrawal no longer erases the evidence. `consent_events` is an append-only
  history — consent given, withdrawn, and number changes while consented, each
  with the number, time and who recorded it — written only by a trigger,
  readable by the admin, never updatable or deletable. `whatsapp_consent_at`
  still holds the current consent's time.
- `whatsapp_consent_at` is now owned by the database on a `true -> true` update
  too, so a value supplied through PostgREST is ignored.

---

## D4. What should `amount_due` show for a fixed-income maturity? — decided

**Decision:** an optional **Maturity amount** on fixed income; the renewals
"Amount due" shows it, falling back to the amount invested. The rule lives in
`src/lib/reminders/amount-due.ts` (`amountDueFor`), used by generation and by
the refresh of untouched future instances.

---

## T1. Full pagination for `listFamilies` and `listRenewals`

**`listRenewals` is done.** The Milestone 3 renewals page gave it real offset
pagination — `page`/`pageSize`, an exact count, ordering by `(due_date, id)` so
a tie can't land on two pages or neither — not just the truncation guard this
entry originally flagged. `truncated` is retained as a backstop for a page
size that collides with PostgREST's own cap, but the page itself requests well
under that, so it cannot fire from that call site today.

**`listFamilies` still only has the guard**, not paging: it reports
`{ families, truncated }` and the family list shows an indicator, which stops
silent data loss but nothing more.

Measured precisely: exactly 1000 rows is safe and complete (HTTP 200); 1001 returns
HTTP 206 with `error: null` and 1000 rows. `max_rows = 1000` is the Supabase **hosted**
default too, not a local artefact.

`listFamilies` needs >1000 households to hit this — remote for a solo advisor, and
the reason it was left as a guard rather than given full paging alongside
`listRenewals`.

**Trigger:** a family count approaching 1000 — worth re-checking whenever the
Excel importer lands a batch of households at once.

## T2. There is no retention policy, in any form

DPDP requires one: personal data may not be kept indefinitely once its purpose is
served. Nothing in the schema, the code or the docs expresses how long a lapsed client's
records are kept or what happens to them. This is a policy question first (Hiral decides
the period) and a scheduled job second.

**More urgent since this milestone:** there is now a steady producer of exactly
the kind of data retention is meant to bound. Every day the cron job runs adds
past `due_instances` rows and `reminder_log` rows, both permanent — nothing in
this milestone deletes or archives either, by design (past instances are
evidence; the log is the send record). Before this branch neither table
accumulated anything at all. The volume is a schedule problem now, not a
hypothetical one.

## T3. Free-text fields have no length bounds — resolved

Every free-text field now has a `.max()` through the shared builders in
`src/lib/validation/fields.ts` (`MAX_LENGTH`: names 120, record names 200,
codes such as policy and folio numbers 50, short labels 80, notes and remarks
1000), with the message "Keep this under N characters." The same pass bounded
amounts to what `numeric(14, 2)` holds and to two decimal places, dates to a
real calendar date between 1950 and 2100, policy terms, goal horizons,
interest rates and reminder windows. The importer inherits all of it by
parsing through the same schemas.

## T4. Fold the repeated holding-section controls into `holding-fields.tsx` — resolved

Done in the UI pass: `ManagedBySelect` and `RemindersToggle` (and the shared
read-mode cell padding) live in
`src/app/(app)/families/[familyId]/_components/holding-fields.tsx`, and all four
holding sections use them.

## T5. Re-open the `23505` mapping in Milestone 3

`result.ts` maps `23505` to "That record already exists." `families`,
`family_members` and `holdings` still carry no unique constraints beyond their
primary keys. `due_instances` now has three writers (`ensure-due-instances.ts`,
`reconcile.ts`, `renewals/actions.ts`) and `reminder_log` has one (`sweep.ts`),
so the unique-constraint writes this entry was waiting on did land — but every
insert that could hit one of them goes through
`upsert(..., { ignoreDuplicates: true })`, which resolves the conflict in
Postgres instead of raising it. The mapping is still dead code, now
deliberately rather than by absence.

**Trigger:** a future writer — most plausibly the Excel importer — that does a
plain insert against `due_instances` or `reminder_log` instead of an
`ignoreDuplicates` upsert.

## T6. The consent-without-mobile hole reopens if the importer bypasses validation

A direct insert of `mobile = ''` with consent `true` succeeds **and** fires
`stamp_consent_time`, producing a consent record against a number that cannot be
contacted. A check constraint tightened this on the branch, and the app path is safe
(`optionalIndianMobile` maps `''` and whitespace to `null` before the refine runs, and
both member actions parse through `memberInput`).

**What reopens it:** any write to `family_members.mobile` that skips
`optionalIndianMobile` — the Excel importer, a seed or backfill script, or a future
"toggle consent" action that updates `whatsapp_consent` alone without re-validating the
stored mobile. Worth re-reading this entry when the importer is designed.

## T7. Milestone 4 must re-check consent and managed-by at send time, not trust the queue

The sweep resolves consent, `whatsapp_consent`, and a holding's `managed_by` exactly
once — at the moment it queues a `reminder_log` row in `pending`. Nothing about that
row is re-verified afterwards. A sender that drains `pending` rows and sends each one
as recorded would message a client who withdrew consent after the row was queued,
whose holding moved from self-managed to external in the meantime, whose family's
`reminders_enabled` was switched off, or whose mobile number changed — none of which
the queued row reflects.

**This is a hard requirement on Milestone 4, not a nice-to-have:** the sender must
re-check consent, managed-by, and reminders-enabled against current data immediately
before sending each row, not rely on the state captured when it was queued. The gap
between queue time and send time can be arbitrarily long — the log is deliberately
allowed to sit in `pending` until a sender exists at all.

## T8. A holding's member can belong to a different family

Nothing in the schema stops `holdings.member_id` from pointing at a `family_members`
row belonging to a family other than `holdings.family_id` — there is no constraint
tying the two together, only the application's own care at write time.

**What makes this urgent:** the Excel importer (T3's trigger) is exactly the kind of
bulk writer likely to get this wrong — a spreadsheet row matched to the wrong member
by name or a stale id would silently create this mismatch, and nothing would flag it.
The importer must validate `member_id` against `family_id` explicitly; this cannot be
left to a database constraint that does not exist.

## T9. An edit form opened before a renewal and saved after it undoes the renewal

The due-date edit form reads the holding's `next_due_date` when it opens. If the
advisor renews that row (advancing `next_due_date`) in one tab or click sequence and
then submits a due-date edit form that was already open before the renewal happened,
the submission re-anchors the schedule to the stale date it was loaded with —
silently undoing the renewal and moving the anchor backwards, exactly the failure
mode Decision 4 was written to prevent for the mark-renewed button itself.

**Trigger:** any workflow that leaves the edit form open across a renewal action —
plausible today with two browser tabs, and more so once anything gives the advisor
reason to have both the row and its edit form open at once.

## T10. Clearing a holding's periodic amount no longer blanks future instance amounts

The deliberate cost of this milestone's fix to `ensureDueInstances` (never refresh
`amount_due` to null, since a null `periodic_amount` means "not applicable" for
fixed income, not "owes nothing"): setting a holding's `periodic_amount` to empty
now leaves every future pristine instance at its last-known amount rather than
blanking it. Previously it blanked correctly for the recurring case but also wrongly
nulled fixed-income amounts, which is the bug this milestone fixed.

**Trigger:** an advisor genuinely clearing a premium (not just editing a policy that
happens to have none) and expecting the renewals page to reflect "amount unknown."
Worth a deliberate design pass once real usage shows whether this is ever a real
scenario for a recurring-premium holding, as opposed to a fixed-income one where it
never applies.

## T11. `dueDatesBetween`'s walk margin and back-off are coupled and unpinned by tests

`WALK_MARGIN_STEPS` (currently 4) has to cover both the deliberate two-step back-off
applied to the starting estimate and the ±1 step of drift month-length clamping can
introduce. Nothing pins the relationship between the two constants — reducing the
margin to 3 throws `dueDatesBetween`'s "exhausted walk bound" error on 1,480 of
45,472 otherwise legitimate `(anchor, frequency, from, through)` inputs, checked by
running it, not derived on paper.

**Trigger:** any future change to the back-off (currently `- 2` steps) or the margin
constant without re-deriving the relationship between them — a property test over a
wide date/frequency grid would catch this before it ships, and none exists today.

## T12. The mark-renewed button uses `disabled`, and `aria-busy` is not reliably announced

`disabled` on the mark-renewed button during a pending save strands keyboard focus —
a keyboard user tabbed to the button loses their place when it becomes unfocusable
mid-click. The `aria-busy` state meant to announce the pending save is not reliably
picked up by screen readers in practice.

**Trigger:** any accessibility review of the renewals page, or a specific report from
a keyboard or screen-reader user — low usage volume today (one advisor) means this is
unlikely to surface on its own.

## T13. Sticky date separators on the renewals page were deferred

The design called for sticky date separators grouping the renewals table visually by
due date; the page ships with a plain date column instead. The sort order still makes
the grouping legible, so this was a cosmetic deferral, not a functional gap.

**Trigger:** revisit once the page has enough real rows on screen at once that eyeballing
date groups from a plain column stops being fast enough — not before.

## T14. There is no way to erase a person's data (consequence of D2)

Every delete in the app is now a soft delete, by decision. DPDP still gives a
data principal the right to erasure, and the only way to honour such a request
today is a manual hard delete in the database. `consent_events` and
`reminder_log.recipient_mobile` would need to be covered by it too.

**Trigger:** the first erasure request, or any move towards more than one user
of the system. With no deleted-items screen in the app, the likely shape is a
scripted, reviewed hard delete run by whoever operates the database, covering
the tables above.
