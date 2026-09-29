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
  delete it → it appears under Deleted items. Then remove it for good with SQL
  (there is no in-app purge yet — see T14 in `docs/follow-ups.md`).
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

### Secrets

The service role key bypasses RLS. Keep it only in Vercel's environment
variables and a password manager. If it leaks, roll it in Supabase and update
Vercel, then redeploy.
