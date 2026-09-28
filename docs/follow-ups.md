# Open follow-ups

Found during the Milestone 2 pre-merge review, verified against the code as merged,
and left alone on purpose. Each entry says why it was left, and what makes it urgent again.

The first three are **decisions, not tickets** — they need Hiral's answer or an
architecture call before anyone writes code.

---

## D1. RLS is "any admin", not "the advisor who owns this family"

**Status:** pre-existing, not introduced by this branch, but this is the first code to
depend on it.

Every RLS policy on `families`, `family_members`, `holdings`, `due_instances`,
`reminder_rules` and `reminder_log` authorises via `is_admin()`. The
`families.owner_advisor_id` column exists, is `NOT NULL`, is indexed, and is set on
every insert — and **no policy consults it**. Verified live: an admin owning zero
families sees all households, members and holdings.

Also: `handle_new_user` defaults an unspecified role to `admin`, so any future signup
path that forgets to set role metadata mints a full-access account.

**Why it is contained today:** `enable_signup = false`, and there is exactly one
advisor. Nothing is exposed to anyone.

**What ends the containment:** a second advisor, or the already-defined `client` role
getting a login. The project brief explicitly requires the design to accommodate
client logins later without a rewrite, and this is the piece that would need to change first.

**Decision needed:** scope the policies to `owner_advisor_id` now while there is one
advisor and the migration is trivial, or accept it and make it the first task of
whatever milestone introduces a second login. Doing it now is cheap; doing it after
client logins ship means changing authorisation on a live dataset.

---

## D2. Deleting a family member is not erasure

Family-level deletion is genuine and complete — every foreign key in the chain is
`ON DELETE CASCADE`, verified.

Member-level deletion is not. `holdings.member_id` is `ON DELETE SET NULL`, so when a
member is removed the holding survives, still carrying `label`, `institution` and its
`details` JSONB — which by design holds `policy_number`, `folio_number` and
`insured_asset`. A policy number identifies a natural person.

The UI is honest about this ("will be kept, but will no longer be attributed to
anyone"), so it is a defensible business choice rather than a bug. But it is not
erasure, and this is exactly the path an individual DPDP erasure request would take.

**Decision needed:** is a per-member erasure request expected to remove that member's
holdings too, or only to de-attribute them? If the former, this needs either a cascade
or an explicit "erase member and their records" action that is separate from the
everyday "remove member" one. That distinction is a product question about what Hiral
means when he removes someone from a household.

**Made worse this milestone:** `reminder_log.recipient_mobile` is written by the
sweep at the moment a reminder is queued and is never touched again. Removing
the family member it belonged to does not remove it — the number sits in a
log table indefinitely, outside the holding it was attributed through, which
this same erasure request would have no reason to look at. Whatever D2
decides for holdings needs to cover `reminder_log` too, or the erasure it
describes is incomplete by construction.

---

## D3. WhatsApp consent semantics when a mobile number changes

**Two reviewers reached opposite conclusions here, which is why it is a decision rather
than a fix.**

Today, editing a member's mobile number leaves `whatsapp_consent` and
`whatsapp_consent_at` untouched.

- One position: correct. It is the same person with a corrected number, and clearing
  consent on a typo fix would be user-hostile.
- The other: wrong. WhatsApp opt-in attaches to the **number**, not the person, so a row
  that keeps a timestamped consent record across a number change is asserting consent
  for a number nobody ever opted in on.

The second argument is stronger on DPDP grounds, but this is Hiral's call — he knows
whether a number edit in practice means "fixed a typo" or "they got a new SIM".

Two related sub-points are **not** contested and should be fixed whichever way D3 goes:

- Withdrawing consent sets `whatsapp_consent_at` to NULL, destroying the evidence that
  consent was ever obtained — including for messages already sent. DPDP s.6 requires the
  fiduciary be able to demonstrate consent. Withdrawal should record a withdrawal, not
  erase the history.
- Neither trigger branch fires on a `true -> true` update, so a `whatsapp_consent_at`
  supplied directly through PostgREST is preserved rather than trigger-owned.

---

## D4. What should `amount_due` show for a fixed-income maturity?

A fixed deposit or bond has no `periodic_amount` — there is no premium to pay on
a schedule — so this milestone's fix to `ensureDueInstances` (never refresh
`amount_due` to null) leaves a fixed-income instance's `amount_due` exactly as
it was set at creation or by hand, permanently. Nothing populates it from the
maturity value automatically.

**Decision needed:** should the maturity instance of a fixed-income holding show
its maturity value in `amount_due`, sourced from `principal_amount` plus
whatever return the product implies, or is `amount_due` meant only for a
recurring premium and legitimately blank for this category? This is a product
question about what the advisor expects to see on the renewals row for an FD
or bond coming due, not an engineering one.

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

## T3. Free-text fields have no length bounds

No `.max()` on `label`, `institution`, `remarks`, `policy_number`, `insured_asset` and
friends. Postgres `text` will accept megabytes. Not a security issue with a single
trusted user, but it becomes one the moment the Excel importer feeds unvetted cell
contents into the same schemas — bound them before that lands, not after.

## T4. Fold the repeated holding-section controls into `holding-fields.tsx`

The managed-by select is byte-identical in four sections; the reminders toggle nearly
so. Reviewed and **deliberately deferred**: the extraction would collapse the blocks
that have never drifted while leaving untouched the surface that actually keeps failing
(per-field error slots, which are irreducibly per-category and cannot live in a shared
component). Cost was estimated honestly at ~70 new lines removing ~100 across 8 files.

**Trigger:** when a fifth thing needs adding to all four sections. The reminders toggle
was already missed once, so the next omission is the signal to do this.

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
