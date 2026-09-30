# Deployment

The app runs on **Vercel** (Next.js, plus the daily reminder cron) against a
hosted **Supabase** project (Postgres, Auth, RLS). Both live in **Mumbai** —
Supabase `ap-south-1`, Vercel functions `bom1` (pinned in `vercel.json`) — so
client data stays in India and every query is a short round trip.

This is the runbook for standing up a new environment and for operating it
afterwards. Work through the sections in order.

## Plans

The current setup uses free plans for a trial period:

- **Vercel Hobby** is for non-commercial use. An advisory business using it for
  real work needs **Pro**.
- **Supabase Free** has **no automatic backups** and pauses a project after
  about a week without activity. **Pro** adds daily backups and never pauses.

Move both to paid plans before the advisor relies on the app for real client
work. Until then, take manual backups (see [Operating](#operating)).

## 1. Supabase

### Create the project

1. New project, region **Mumbai (ap-south-1)**.
2. Generate a strong database password and keep it in a password manager.

### Auth settings (dashboard → Authentication)

`supabase/config.toml` only configures the local stack; none of it carries over
to a hosted project. Set these by hand:

- **Disable sign-ups.** Hosted projects allow them by default, and the anon key
  is public (it ships to the browser), so anyone could otherwise create an
  account. This is the most important setting on this page.
- **Site URL**: the production address, e.g. `https://<project>.vercel.app`.
- **Minimum password length**: 12.

### Apply the schema

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`db push` applies every file in `supabase/migrations/`, including the default
reminder rules. Check the list it prints before confirming.

### Create the advisor account

Pass the production values inline so they are never written to disk (inline
environment variables take precedence over `.env.local`). The advisor chooses
the password; whoever types this command should be the advisor, or use a
temporary password the advisor changes at first sign-in.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
SEED_ADMIN_EMAIL=<advisor-email> \
SEED_ADMIN_PASSWORD=<password> \
npm run db:seed-admin
```

Prefix the command with a space if your shell is set to skip such lines in its
history, or clear the history entry afterwards.

**Never run `db:seed-sample` or `db:seed` against production** — the sample
script deletes and recreates a household. It refuses to run unless
`NEXT_PUBLIC_SUPABASE_URL` points at a local Supabase.

## 2. Vercel

1. Import the GitHub repository. The framework preset (Next.js) and Node
   version (`engines` in `package.json`) are picked up automatically.
2. Environment variables — set these for the **Production** environment only,
   so preview deployments of other branches can never reach client data:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
   | `CRON_SECRET` | a fresh random value: `openssl rand -hex 32` |

   WhatsApp is not needed to deploy. Without its variables the app ships with
   WhatsApp switched off; see [WhatsApp](#whatsapp) to connect it later.

   Use a new `CRON_SECRET` for production, not the one from `.env.local`.
3. Deploy. The daily cron in `vercel.json` registers with the deployment. On
   Hobby it runs once a day at some point within the scheduled hour, not at an
   exact minute.

## 3. Verify

- The advisor can sign in.
- Sign-ups are rejected: a `signUp` call with the anon key returns an error.
- Settings → enter the advisor's mobile number (reminders for policies held
  elsewhere go to it).
- Round trip: add a test household with one policy → it appears on Renewals →
  delete it → it disappears from the app but is still in the database with
  `deleted_at` set (see [Restoring a deleted record](#restoring-a-deleted-record)).
  Then remove it for good with SQL (there is no in-app purge — see T14 in
  `docs/follow-ups.md`).
- Trigger the reminder sweep once by hand; the response is counts only:

  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" \
    https://<project>.vercel.app/api/cron/reminders
  ```

- Vercel → Settings → Cron Jobs lists `/api/cron/reminders`.

## Operating

### Backups

On Supabase Free there are none unless you take them. At least weekly, and
always before pushing a migration:

```bash
npx supabase db dump --linked -f schema.sql
npx supabase db dump --linked --data-only -f data.sql
```

The dump contains client personal data. Store it encrypted, outside the
repository, and delete old copies you no longer need.

### Pausing

Free projects pause after about seven days without activity. The daily cron
touches the database, which should keep it awake — confirm after the first
week. While paused, nobody can sign in and no reminders are queued; resume it
from the Supabase dashboard.

### Schema changes

1. Take a backup.
2. `npx supabase db push` — applies only the migrations not yet on the project.
3. Deploy the code that depends on them.

### Passwords

The advisor changes their own password under Settings → Your password, which
asks for the current one first. There is no emailed reset link: Supabase's
built-in mailer only delivers to members of the Supabase team, so a
"forgot password" email needs an SMTP provider connected first. Until then, a
forgotten password is set again in Supabase → Authentication → Users → the
advisor's row, and handed over in person or by phone.

### Restoring a deleted record

Deleting a household, member or policy in the app never removes it: the row is
stamped with `deleted_at` and hidden everywhere, including from reminders. The
advisor has no screen for deleted records; bringing one back is done here, in
the Supabase SQL editor or with `npx supabase db query --linked "<sql>"`.

Find it:

```sql
select 'household' as kind, id, name, deleted_at from families where deleted_at is not null
union all
select 'member', id, name, deleted_at from family_members where deleted_at is not null
union all
select 'holding', id, category::text, deleted_at from holdings where deleted_at is not null
order by deleted_at desc;
```

Restore it by clearing the stamp on that one row:

```sql
update families set deleted_at = null where id = '<id>' returning id, name;
-- or: update family_members ... / update holdings ...
```

A household's members and holdings are hidden through the household, not
stamped themselves, so restoring the household brings them all back. Reminders
resume from the next daily run.

### WhatsApp

Reminders go out through Meta's WhatsApp Cloud API, from the daily cron, after
the sweep. The design, including the exact template wording to submit, is
`docs/specs/2026-09-30-milestone-4-whatsapp-sender-design.md`.

Until all four required variables below are set, the app is **not connected**:
Settings shows "Not connected", the mode cannot leave Off, nothing is sent, and
`/api/whatsapp/webhook` answers 404.

| Variable (Production only) | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | A permanent system-user token with `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | The sending number's id, from WhatsApp Manager → API setup |
| `WHATSAPP_APP_SECRET` | Meta app → Settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | Any random string: `openssl rand -hex 16` |
| `WHATSAPP_API_VERSION` | Optional; defaults to `v23.0` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Optional; defaults to `en` |

Going live:

1. Meta Business verification, then a WhatsApp Business account and number.
2. Submit the two templates in the design doc (`policy_due_reminder`,
   `advisor_daily_summary`), category Utility, and wait for approval.
3. Create a system user with `whatsapp_business_messaging` and generate a
   permanent token.
4. Add the four variables in Vercel (Production only) and redeploy.
5. In the Meta app, register the webhook: callback
   `https://<project>.vercel.app/api/whatsapp/webhook`, verify token as above;
   subscribe to `messages`.
6. Settings → WhatsApp → **Send me a test message** (Meta's own `hello_world`).
7. Switch to **Test** for a few days: every message, clients' included, comes
   to the advisor's own number; the reminders stay queued. Check them on the
   Messages page.
8. Switch to **Live**. **Off** stops sending at once, at any time.

A reply of STOP switches that member's WhatsApp consent off by itself and is
recorded in the consent history as the client's own withdrawal. Other replies
appear on the Messages page for the advisor to answer from their phone.

### Secrets

The service role key bypasses RLS. Keep it only in Vercel's environment
variables and a password manager. If it leaks, roll it in Supabase and update
Vercel, then redeploy.
