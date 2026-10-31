# Milestone 4 — WhatsApp sender

Status: approved, ready for an implementation plan
Date: 2026-09-30
Builds on: Milestone 3 (reminder engine), decisions D2 (soft delete) and D3 (consent history)

## Purpose

Milestone 3 queues every reminder that comes due as a `reminder_log` row in
`pending`, and sends nothing. This milestone sends them over WhatsApp through
Meta's Cloud API, tracks what happened to each message, and handles replies —
opt-outs automatically, everything else by showing it to the advisor.

It ships **switched off**. Nothing can be sent until the Meta credentials are
added to the environment and the advisor turns WhatsApp on in Settings.

## Scope

In:

1. A provider-neutral sending interface with a Meta Cloud API implementation
   and a fake one for local use and tests
2. A sender that drains `pending` rows after the daily sweep, re-checking each
   against current data first (T7)
3. One daily summary message to the advisor instead of one per policy
4. An Off / Test / Live switch in Settings, and a "send me a test message" button
5. A webhook for delivery statuses and incoming messages
6. Automatic opt-out on "STOP"; every other reply stored and shown to the advisor
7. A Messages page: recent sends, failures, replies

Out:

- A per-household message history (the Messages page covers it for now)
- Templates in languages other than English (the language code is configurable)
- Quiet hours (the daily run already lands between 09:00 and 10:00 IST)
- Two-way chat from inside the app — the advisor replies from their phone
- Any other provider; the interface keeps that possible

## Decisions

| Question | Decision | Rejected |
|---|---|---|
| Provider | Meta Cloud API directly | Indian BSPs (₹1,350–3,800/month for features the app already has), Twilio |
| When sending runs | Inside the existing daily cron, as its own step after the sweep | A second cron (harder to watch, unpredictable on Hobby); a queue service |
| Advisor's reminders | One daily summary | One message per policy (noisy, more paid messages) |
| Where the mode lives | A settings row, switched in the app | Environment only (the advisor could not pause it) |
| Replies | STOP opts out automatically; other replies stored and shown | Opt-out only; replies left for later |
| Test mode | Sends the real client message to the advisor's own number; the reminder stays `pending` | Consuming the reminder (it would never reach the client when Live) |
| A changed client number while consent stands | Send to the current number and record it (D3 keeps consent across a number change) | Skipping (the client would silently miss the reminder) |

## Configuration

Environment variables, Production scope only, none of them `NEXT_PUBLIC_`:

| Variable | Purpose |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta system-user token with `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | The sending number's id (not the number itself) |
| `WHATSAPP_APP_SECRET` | Verifies that webhook calls come from Meta |
| `WHATSAPP_VERIFY_TOKEN` | Any random string; Meta echoes it once when the webhook is registered |
| `WHATSAPP_API_VERSION` | Optional, default `v23.0` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional, default `en` |

The app is **connected** only when the first four are all set. Without them the
mode cannot leave Off, the sender does nothing, and the webhook answers 404.

The link in the advisor summary uses `VERCEL_PROJECT_PRODUCTION_URL` (a Vercel
system variable, already exposed to the project), falling back to
`http://localhost:3000`.

## Templates to submit to Meta

Both are category **Utility**, language **English (`en`)**. Meta rejects a
template that starts or ends with a variable, and rejects parameter values
containing newlines, tabs or more than four consecutive spaces — the app strips
those before sending.

`policy_due_reminder` — to a client:

> Hello {{1}}, this is a reminder from {{2}} that your {{3}} is due on {{4}}.
> Amount: {{5}}. Reply to this message if you have any questions, or reply
> STOP to stop these reminders.

| Variable | Value |
|---|---|
| {{1}} | Member's name |
| {{2}} | Advisor's name (`profiles.full_name`) |
| {{3}} | The holding's label, e.g. "LIC Jeevan Anand" |
| {{4}} | Due date, DD-MM-YYYY |
| {{5}} | Amount due as ₹ with Indian grouping (₹12,500), or "as per your policy" when unknown |

`advisor_daily_summary` — to the advisor:

> Good morning. {{1}} due soon: {{2}}. Overdue: {{3}}. See the Renewals page
> for details: {{4}} — sent by Kunba.

| Variable | Value |
|---|---|
| {{1}} | Count of reminders in this summary |
| {{2}} | Up to 5 items as "Family – Holding (DD-MM-YYYY)", joined by "; ", then "and N more" |
| {{3}} | Count of overdue unpaid due dates across live households |
| {{4}} | `https://<production host>/renewals` |

The "send me a test message" button uses `hello_world`, which Meta creates on
every WhatsApp Business account.

## Data model

One migration.

**`app_settings`** — a single row (`id boolean primary key default true check (id)`):
`whatsapp_mode` (`off | test | live`, default `off`), `updated_at`, `updated_by`.
Admin may read and update; nobody inserts or deletes through the API.

**`reminder_status`** gains `sending`, `delivered`, `read`.

**`reminder_log`** gains:

| Column | Meaning |
|---|---|
| `skip_reason` | Why a row was skipped (see the re-check list) |
| `attempts` | Send attempts so far |
| `claimed_at` | When a run took the row to send it |
| `delivered_at`, `read_at` | From delivery webhooks |
| `test_sent_at` | When a Test-mode preview of this row went to the advisor |
| `summary_message_id` | For advisor rows: the summary message that covered them |

**`whatsapp_inbound`** — replies: `id`, `from_mobile` (E.164), `body`,
`provider_message_id` (unique, so a redelivered webhook is stored once),
`received_at`, `member_ids` (members with that number, if any), `opt_out`
(boolean), `handled_at`, `handled_by`. Admin read, admin update of the
handled columns only.

**`consent_events`** gains `source` (`advisor | client_reply`, default
`advisor`). The trigger reads it from the transaction-local setting
`app.consent_source`, which only the opt-out function sets.

**`withdraw_consent_by_reply(mobile text)`** — security definer function, not
executable by `anon` or `authenticated`: sets `app.consent_source` to
`client_reply` for the transaction, switches consent off for every live member
with that number, and returns their ids. The existing trigger writes the
`withdrawn` events.

## Components

`src/lib/whatsapp/`:

- `config.ts` — reads the environment; `isConnected()`
- `provider.ts` — the interface: `sendTemplate(to, name, params)` returning
  `{ ok: true, messageId } | { ok: false, retryable, error }`; `sendText(to, body)`
  for the free opt-out confirmation inside the 24-hour reply window
- `meta.ts` — the Cloud API implementation (`POST /{version}/{phone-number-id}/messages`)
- `fake.ts` — records calls in memory; used when not connected in development and in every test
- `messages.ts` — pure: builds each template's parameters, sanitises values, formats ₹ and dates
- `recheck.ts` — pure: decides send / skip-with-reason / send-to-new-number for one row from current data
- `plan.ts` — pure: collapses catch-up rows, splits client rows from advisor rows, applies the cap
- `send.ts` — `runSender(client, today, mode, provider)`: loads, re-checks, claims, sends, records
- `webhook.ts` — pure: signature check, payload parsing, STOP detection

Routes and pages:

- `src/app/api/whatsapp/webhook/route.ts` — `GET` for Meta's verification
  handshake, `POST` for events; exempted from the session gate like `/api/cron/`
- `src/app/api/cron/reminders/route.ts` — calls `runSender` after the sweep
- Settings gains a WhatsApp section; a new `/messages` page joins the primary nav

## The daily send

After the sweep, if the mode is not Off and the app is connected:

1. **Recover stuck rows.** A row left in `sending` for over an hour (a run that
   died mid-send) becomes `failed` with "interrupted — not resent, to avoid a
   duplicate". It is never retried automatically: the message may have gone.
2. **Load** every `pending` row with its due instance, holding, household,
   member and advisor profile as they are **now**.
3. **Re-check each row** (T7). Skip, with the reason recorded, when:
   - the holding or its household is deleted — `deleted`
   - the holding's reminders are off — `reminders_off`
   - the due instance is paid, off schedule, or superseded by a renewal — `resolved`
   - the due date is before today — `expired`
   - for a client row: the holding is now managed elsewhere — `managed_elsewhere`;
     the member is removed — `member_removed`; consent is withdrawn — `no_consent`;
     no number — `no_mobile`
   - for an advisor row: the advisor has no number — `no_mobile`

   If a consented client's number changed, send to the current number and
   update `recipient_mobile`.
4. **Collapse catch-up.** Of several pending rows for the same due instance and
   recipient, only the one with the smallest `days_before` (the latest window)
   is sent; the rest are skipped as `superseded`.
5. **Cap.** At most 200 client messages per run; the rest stay `pending` for
   the next run. The advisor summary is one message regardless.
6. **Send, row by row.** Claim with a conditional update
   (`pending → sending where status = 'pending'`); a row another run already
   claimed is left alone. Then send, and record:
   - success — `sent`, `sent_at`, `provider_message_id`
   - retryable failure (network error, HTTP 429 or 5xx) — back to `pending`,
     `attempts + 1`; on the third attempt, `failed`
   - any other failure — `failed` with Meta's error message
7. **Advisor summary.** All valid advisor rows go into one message; on success
   each row becomes `sent` with the shared `summary_message_id`. No summary is
   sent when there are no advisor rows.

**Test mode** runs steps 1–4 unchanged, then sends each client row's real
message and the summary **to the advisor's number** instead, stamps
`test_sent_at`, and leaves the rows `pending`. A row with `test_sent_at` is not
previewed again. Switching to Live sends whatever is still valid for real.
Without an advisor number, Test mode sends nothing and leaves every row as it
was; Settings says so next to the mode switch.

The cron response gains `whatsapp: { mode, sent, skipped, failed, deferred }` —
counts only, like the rest of it.

## Webhook

`GET` — returns `hub.challenge` when `hub.mode` is `subscribe` and
`hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`; 403 otherwise.

`POST` — rejected with 401 unless `X-Hub-Signature-256` equals
`sha256=` + HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`, compared in
constant time. Then, for each change:

- **Statuses** — matched on `provider_message_id` (or `summary_message_id`):
  `delivered` and `read` set the status and time; `failed` sets `failed` with
  Meta's error. A status never moves backwards (`read` is not overwritten by a
  late `delivered`).
- **Messages** — stored in `whatsapp_inbound` once per message id. A text that,
  lower-cased and stripped of punctuation, is `stop`, `unsubscribe`, `opt out`,
  `optout` or `stop all` calls `withdraw_consent_by_reply` and sends the free
  confirmation "You won't receive further reminders from <advisor>. Reply START
  if you change your mind." (`START` is stored as a reply for the advisor; it
  does not re-grant consent automatically — consent is recorded by the advisor.)

The handler always answers 200 once the signature is valid, even for events it
ignores, so Meta does not retry them. Logs carry ids only.

## Screens

**Settings → WhatsApp**
- Connection: "Connected (number id …1234)" or "Not connected — add the Meta keys in Vercel"
- Mode: Off / Test / Live. Disabled when not connected. Choosing Live asks for
  confirmation: "Clients will start receiving reminders from tomorrow's run."
- "Send me a test message" — sends `hello_world` to the advisor's number; shows
  the result. Disabled when not connected or when the advisor has no number.

**Messages** (`/messages`, in the primary nav)
- Needs attention: failed messages — who, which policy, Meta's error
- Replies: unhandled first, with the member and household when the number
  matches one; "Mark handled"; opt-outs labelled as such
- Recent: the last 30 days of sent / delivered / read / skipped, newest first,
  skipped rows showing their reason; test previews labelled "Test"

## Security and privacy

- Only the webhook route is newly reachable without a session, and it does
  nothing without a valid signature.
- The access token and app secret never reach the browser.
- Cron and webhook responses and logs contain counts and ids, never names,
  numbers or message text.
- Opt-outs are recorded in the append-only consent history with
  `source = client_reply` (DPDP: demonstrable withdrawal).
- Replies contain client personal data; `whatsapp_inbound` is admin-only under
  RLS, and falls under the retention question in T2.

## Testing

Nothing in the test suite calls Meta.

- Unit: template parameters and sanitising; ₹ and date formatting; every
  re-check outcome; catch-up collapsing and the cap; signature verification
  (valid, tampered, missing); STOP detection; webhook payload parsing
- Integration (local Supabase, fake provider): a full run in each mode; stuck
  rows; retries up to the limit; a concurrent claim; the summary; status
  webhooks moving rows forward and never back; an opt-out writing a
  `client_reply` consent event; a redelivered webhook stored once
- Component: the Settings section in each connection state; the Messages page
- End to end: switching modes in Settings; the Messages page listing a failure
  and a reply (arranged in the database)

## Going live (for the runbook)

1. Meta Business verification; a WhatsApp Business account and number
2. Submit the two templates above; wait for approval
3. Create a system user with `whatsapp_business_messaging`; generate a permanent token
4. Add the four variables in Vercel (Production only) and redeploy
5. In Meta, register the webhook: `https://<host>/api/whatsapp/webhook` with the
   verify token; subscribe to `messages`
6. Settings → "Send me a test message", then Test mode for a few days, then Live
