# Milestone 4 — WhatsApp sender: implementation plan

Design: `docs/specs/2026-09-30-milestone-4-whatsapp-sender-design.md` (approved).

**Goal:** send the queued reminders over Meta's WhatsApp Cloud API, track
delivery, handle replies and opt-outs — shipped switched off.

**Architecture:** pure decision modules (`messages`, `recheck`, `plan`,
`webhook`) under `src/lib/whatsapp/`, one orchestrator (`send.ts`) called from
the existing daily cron after the sweep, a provider interface with Meta and fake
implementations, a signed webhook route, and two screens (Settings section,
Messages page). The mode lives in a one-row `app_settings` table.

**Stack:** Next.js 16 route handlers and server actions, Supabase (Postgres +
RLS, service-role client for cron and webhook), Zod 4, Vitest, Playwright.

**Global constraints** (from the codebase, unchanged):
- No AI or tool attribution anywhere version-controlled.
- Every UPDATE/DELETE `.select('id')`s and treats empty as failure.
- ISO dates in storage; DD-MM-YYYY only at the edge (templates are an edge).
- Cron and webhook responses and logs carry counts and ids only.
- Nothing in the test suite calls Meta: tests use `FakeProvider`.
- Don't run Prettier over existing files; code is written at ~100 columns.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260930090000_whatsapp.sql` | `app_settings`, new statuses and columns, `whatsapp_inbound`, `consent_events.source`, `withdraw_consent_by_reply` |
| `src/lib/whatsapp/config.ts` | Environment reading, `whatsappConfig()`, `isConnected()` |
| `src/lib/whatsapp/provider.ts` | `WhatsAppProvider` interface and result types |
| `src/lib/whatsapp/meta.ts` | Cloud API implementation over `fetch` |
| `src/lib/whatsapp/fake.ts` | In-memory implementation for tests and unconnected dev |
| `src/lib/whatsapp/messages.ts` | Template names, parameter builders, sanitising |
| `src/lib/whatsapp/recheck.ts` | One row + current data → send / skip(reason) |
| `src/lib/whatsapp/plan.ts` | Collapse catch-up, split client/advisor, cap |
| `src/lib/whatsapp/send.ts` | `runSender` orchestration against the database |
| `src/lib/whatsapp/settings.ts` | Read/write `app_settings.whatsapp_mode` |
| `src/lib/whatsapp/webhook.ts` | Signature check, payload parsing, STOP detection |
| `src/lib/whatsapp/inbound.ts` | Apply parsed webhook events to the database |
| `src/app/api/whatsapp/webhook/route.ts` | GET handshake, POST events |
| `src/app/api/cron/reminders/route.ts` | Calls `runSender` after the sweep |
| `src/lib/supabase/middleware.ts` | Exempts `/api/whatsapp/webhook` from the session gate |
| `src/app/(app)/settings/reminders/whatsapp-actions.ts` | `setWhatsAppMode`, `sendTestMessage` |
| `src/app/(app)/settings/reminders/_components/WhatsAppSection.tsx` | Connection, mode switch, test button |
| `src/lib/queries/messages.ts` | Failures, replies, recent sends for the Messages page |
| `src/app/(app)/messages/…` | Page, `markReplyHandled` action, components |
| `src/components/ui/PrimaryNav.tsx` | "Messages" nav item |

## Tasks

Each task: failing test → run it, see it fail → implement → run it, see it
pass → lint and type-check → commit. Commands: `npx vitest run <file>`,
`npx playwright test <file>`, `npx tsc --noEmit -p .`, `npx eslint src tests`.

### Task 1 — Migration and types

Create the migration exactly as the design's Data model section describes:

- `create type whatsapp_mode as enum ('off','test','live')`; `app_settings`
  with `id boolean primary key default true check (id)`, `whatsapp_mode`
  default `off`, `updated_at`, `updated_by` (fk profiles, set null); seed the
  row; RLS: admin select, admin update of `whatsapp_mode, updated_at,
  updated_by` only; revoke insert/delete.
- `alter type reminder_status add value 'sending' | 'delivered' | 'read'`.
- `reminder_log` add `skip_reason text`, `attempts int not null default 0`,
  `claimed_at`, `delivered_at`, `read_at`, `test_sent_at` (timestamptz),
  `summary_message_id text`; index on `provider_message_id` and on
  `summary_message_id`; index on `status`.
- `whatsapp_inbound` table + RLS (admin select; admin update of
  `handled_at, handled_by` only).
- `create type consent_source as enum ('advisor','client_reply')`;
  `consent_events add source consent_source not null default 'advisor'`;
  replace `record_consent_event()` so the insert takes
  `coalesce(nullif(current_setting('app.consent_source', true), ''), 'advisor')::consent_source`.
- `withdraw_consent_by_reply(p_mobile text) returns setof uuid`, security
  definer, `set_config('app.consent_source','client_reply', true)`, updates
  live consented members with that mobile, returns ids; `revoke execute … from
  public, anon, authenticated`.

Apply with `npx supabase migration up`, regenerate `npm run db:types`.

Tests `tests/integration/whatsapp-schema.test.ts`:
- the settings row exists and defaults to `off`
- an admin can switch the mode; a client-role user cannot; nobody can insert a second row
- `withdraw_consent_by_reply` switches consent off for a live consented member
  with that number, not for a removed one, and writes a `withdrawn` event with
  `source = 'client_reply'`
- an ordinary consent change still records `source = 'advisor'`
- `authenticated` cannot execute `withdraw_consent_by_reply`

### Task 2 — Provider interface, Meta and fake implementations, config

`provider.ts`:

```ts
export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; error: string }

export interface WhatsAppProvider {
  sendTemplate(to: string, template: string, params: string[]): Promise<SendResult>
  sendText(to: string, body: string): Promise<SendResult>
}
```

`config.ts`: `whatsappConfig()` returns `{ accessToken, phoneNumberId, appSecret,
verifyToken, apiVersion, language } | null` (null unless all four required
variables are set); `isConnected()`.

`meta.ts`: `createMetaProvider(config, fetchImpl = fetch)`. Posts to
`https://graph.facebook.com/{version}/{phoneNumberId}/messages` with bearer
token. `to` is E.164 without the `+`. Template body:
`{ messaging_product:'whatsapp', to, type:'template', template:{ name, language:{code},
components:[{ type:'body', parameters: params.map(text => ({type:'text', text})) }] } }`.
Success → `messages[0].id`. HTTP 429/5xx or a thrown fetch → retryable. Other
errors → not retryable, `error.message` from Meta's body. Never logs the token.

`fake.ts`: `createFakeProvider({ fail?: (to) => SendResult | null })` with a
`sent` array of `{ to, template?, params?, text? }` and incrementing ids.

Tests `tests/unit/whatsapp/meta.test.ts` (fetch stubbed): request URL, headers
and body; `+` stripped; success id; 429 and 500 retryable; 400 not retryable
with Meta's message; network throw retryable. `config.test.ts`: null unless all
four set; defaults for version and language.

### Task 3 — Message parameters

`messages.ts`:

```ts
export const TEMPLATES = { clientReminder: 'policy_due_reminder', advisorSummary: 'advisor_daily_summary', test: 'hello_world' }
export function sanitizeParam(value: string): string  // newlines/tabs → space, collapse runs of spaces, trim, cap 1000
export function clientReminderParams(i: { memberName; advisorName; holdingLabel; dueDate /*ISO*/; amountDue: number | null }): string[]
export function advisorSummaryParams(i: { items: { familyName; holdingLabel; dueDate }[]; overdueCount: number; renewalsUrl: string }): string[]
export const OPT_OUT_CONFIRMATION = (advisorName: string) => string
```

Tests: DD-MM-YYYY date; ₹ with Indian grouping; null amount → "as per your
policy"; sanitising newlines/tabs/5 spaces; summary lists up to 5 items sorted
by due date then "and N more"; singular/plural not needed (counts are digits).

### Task 4 — Re-check

`recheck.ts`:

```ts
export type SkipReason = 'deleted' | 'reminders_off' | 'resolved' | 'expired'
  | 'managed_elsewhere' | 'member_removed' | 'no_consent' | 'no_mobile' | 'superseded'
export interface RowState { recipientType: 'advisor' | 'client'; recipientMobile: string;
  dueDate: string; paymentStatus: string; offSchedule: boolean; holdingDeleted: boolean;
  familyDeleted: boolean; remindersEnabled: boolean; managedBy: 'self' | 'external';
  nextDueDate: string | null; member: { deleted: boolean; consent: boolean; mobile: string | null } | null;
  advisorMobile: string | null }
export type Recheck = { action: 'send'; mobile: string } | { action: 'skip'; reason: SkipReason }
export function recheck(row: RowState, today: string): Recheck
```

One test per reason, plus: a changed consented client number sends to the new
number; an advisor row sends to the current advisor number; `nextDueDate` equal
to the due date still sends (mirrors the sweep).

### Task 5 — Planning a run

`plan.ts`:

```ts
export interface Candidate { id: string; dueInstanceId: string; daysBefore: number; recipientType: 'advisor' | 'client' }
export function collapseCatchUp<T extends Candidate>(rows: T[]): { keep: T[]; superseded: T[] }
export function applyCap<T>(rows: T[], cap: number): { now: T[]; deferred: T[] }
export const CLIENT_CAP_PER_RUN = 200
```

Tests: keeps the smallest `daysBefore` per (instance, recipient type); the
advisor and client rows of one instance are independent; cap keeps order.

### Task 6 — Sender

`settings.ts`: `getWhatsAppMode(client)`, `setWhatsAppMode(client, mode, userId)`.

`send.ts`: `runSender(client, { today, mode, provider, renewalsUrl, now = new Date() })`
→ `{ mode, sent, skipped, failed, deferred }`. Steps exactly as the design's
"The daily send": recover `sending` rows claimed over an hour ago → load
`pending` rows (in Test mode: only rows with `test_sent_at is null`) with
current joins → `recheck` → write skips → `collapseCatchUp` (write
`superseded`) → split → cap clients → per client row claim (`update … set
status='sending', claimed_at=now where id=… and status='pending' select id`),
send, record → one advisor summary. Test mode sends every message to the
advisor's current number, stamps `test_sent_at`, restores `pending`, never
writes `sent`. Retryable failure: back to `pending`, `attempts+1`, `failed`
once `attempts` reaches 3. Overdue count for the summary reuses the sweep's
filters (unpaid, not off-schedule, live, due before today, not superseded).

Tests `tests/integration/whatsapp-send.test.ts` (fake provider, fixtures via
admin client, own household): Live sends a client reminder with the right
parameters and marks it sent; each skip reason is written; a changed number is
used and recorded; catch-up sends one and supersedes the rest; retryable
failure returns to pending and fails on the third attempt; permanent failure
fails immediately; a row claimed by someone else is not sent; a stuck
`sending` row becomes failed and is not sent; the advisor gets one summary
covering all advisor rows, each marked with the summary id; Test mode sends to
the advisor, stamps `test_sent_at`, leaves rows pending and does not repeat;
Off sends nothing.

### Task 7 — Cron wiring

After the sweep: if `isConnected()` and mode ≠ off, `runSender` with the Meta
provider; response gains `whatsapp` counts (or `{ mode, sent:0, … }`).
A sender failure is logged by id and reported as `whatsapp: null` without
failing the sweep's 200. Test in `tests/integration/cron-reminders.test.ts`:
not connected → `whatsapp.mode` is `off` and the fake records nothing (inject
the provider through a module seam: `getProvider()` in `config.ts`, mocked).

### Task 8 — Webhook parsing

`webhook.ts`:

```ts
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean
export type WebhookEvent =
  | { kind: 'status'; messageId: string; status: 'sent' | 'delivered' | 'read' | 'failed'; at: Date; error?: string }
  | { kind: 'message'; messageId: string; from: string /*E.164 with +*/; body: string; at: Date }
export function parseWebhook(payload: unknown): WebhookEvent[]
export function isOptOut(text: string): boolean
```

Tests: valid, tampered, missing and malformed signatures; statuses and text
messages parsed from Meta's documented shape; non-text messages stored with a
"[image]"-style body; unknown shapes ignored; STOP variants (case,
punctuation, "opt out", "stop all") and non-matches ("stop the policy?",
"cancel").

### Task 9 — Webhook route and applying events

`inbound.ts`: `applyEvents(client, events, provider, advisorName)`:
statuses move forward only (`sent < delivered < read`; `failed` only from
`sent`/`sending`), matched on `provider_message_id` or `summary_message_id`;
messages upsert into `whatsapp_inbound` on `provider_message_id` ignoring
duplicates, with `member_ids` looked up by mobile; opt-outs call the RPC and
send the confirmation text.

Route: GET handshake; POST reads the raw body, 404 when not connected, 401 on
a bad signature, otherwise applies events and returns 200.

Tests `tests/integration/whatsapp-webhook.test.ts`: handshake ok/forbidden;
unsigned 401; delivered then read; late delivered after read ignored; failed
recorded; summary id statuses update every covered row; a reply stored once
across two deliveries with its member matched; STOP withdraws consent with a
`client_reply` event and sends one confirmation.

### Task 10 — Session gate

`middleware.ts`: exempt the exact prefix `/api/whatsapp/webhook`.
Test in `tests/integration/middleware.test.ts`: the webhook path is not
redirected; `/api/whatsapp/other` still is.

### Task 11 — Settings section

Actions: `setWhatsAppMode(mode)` (admin session; refuses test/live when not
connected; refuses test when the advisor has no mobile); `sendTestMessage()`
(connected + advisor mobile; sends `hello_world`; returns ok or Meta's error).
Component `WhatsAppSection` props: `connected`, `numberIdHint`, `mode`,
`advisorMobile`, the two actions. Live asks `window.confirm`.

Tests: component (not connected → disabled with explanation; connected →
switch calls the action; Live confirms first; test button shows result);
integration for the actions (refusals and success, with `isConnected` mocked).

### Task 12 — Messages page

Queries (`src/lib/queries/messages.ts`): `listFailedMessages`,
`listReplies` (unhandled first, member + household joined when matched),
`listRecentMessages` (30 days, newest first, skip reasons, test previews).
Action `markReplyHandled(id)`. Page `/messages` with three sections using the
shared table styles (`TABLE_WRAP`, `FULL_ROW` for empty messages).

Tests: integration for the queries and the action; component for the page
sections' empty and populated states.

### Task 13 — Navigation and end-to-end

Add "Messages" to `NAV_ITEMS` between Renewals and Settings; update the
PrimaryNav unit test. E2E `tests/e2e/whatsapp.spec.ts`: Settings shows "Not
connected" and a disabled switch (the dev server has no Meta keys); the
Messages page lists a failure and a reply arranged through the admin client.
Add `/messages` to the phone-width test.

### Task 14 — Docs

`docs/deployment.md`: the WhatsApp variables and the "Going live" checklist
from the design. `docs/follow-ups.md`: T7 resolved (re-check at send time).
`README.md`: mention the Messages page. Update `PROJECT-CONTEXT.md` (outside
the repo).
