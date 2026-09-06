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

## T1. Full pagination for `listFamilies` and `listRenewals`

A truncation **guard** landed on this branch (both functions now report
`{ rows, truncated }` and the family list shows an indicator). That stops silent data
loss; it does not add paging.

Measured precisely: exactly 1000 rows is safe and complete (HTTP 200); 1001 returns
HTTP 206 with `error: null` and 1000 rows. `max_rows = 1000` is the Supabase **hosted**
default too, not a local artefact.

`listFamilies` needs >1000 households to hit this — remote for a solo advisor.
`listRenewals` is the exposed one: it selects `due_instances`, which multiply per
holding per period, so roughly 300 households × 5 holdings with monthly SIPs exceeds
1000 rows in a one-year window at entirely ordinary scale. That is the page the
project brief designates the daily driver.

**Do this when the renewals listing page is built** (Milestone 3), not before — the
paging UI and the query should be designed together.

## T2. There is no retention policy, in any form

DPDP requires one: personal data may not be kept indefinitely once its purpose is
served. Nothing in the schema, the code or the docs expresses how long a lapsed client's
records are kept or what happens to them. This is a policy question first (Hiral decides
the period) and a scheduled job second.

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

`result.ts` maps `23505` to "That record already exists." — but `families`,
`family_members` and `holdings` carry **no unique constraints whatsoever** beyond their
primary keys, and nothing in `src/` writes `due_instances` at all. The mapping is dead
code for this entire milestone. It goes live when reminder-rule and due-instance writes
land and the unique constraints come with them.

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
