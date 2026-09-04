# Family Financial Ledger

A private workspace for a financial advisor to record every product a client
family holds — life insurance, general insurance, mutual funds, and fixed
income — and to track renewals, due dates, and payment status across all of
them.

## Requirements

- Node 22+
- Docker (for the local database)

## Getting started

```bash
npm install
npm run db:start
cp .env.local.example .env.local   # fill in from `npx supabase status -o env`
npm run db:reset
npm run db:types
npm run db:seed
npm run dev
```

Sign in at http://localhost:3000/login with the credentials in `.env.local`.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Start the development server |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | Browser tests |
| `npm run db:reset` | Reapply migrations |
| `npm run db:types` | Regenerate TypeScript types from the schema |
| `npm run db:seed-admin` | Create the advisor account |
| `npm run db:seed-sample` | Insert the sample household (idempotent; requires the advisor account to exist) |
| `npm run db:seed` | Run `db:seed-admin` then `db:seed-sample` |

## Layout

- `src/lib/domain/` — pure business logic; no framework imports, heavily tested
- `src/lib/validation/` — Zod schemas for category-specific holding fields
- `src/lib/queries/` — composed database reads
- `supabase/migrations/` — schema source of truth
- `docs/data-model.md` — why the schema is shaped the way it is
