# Data model

The ledger records every financial product a client family holds, whether or
not this firm manages it. Externally managed holdings are tracked
deliberately: they drive the consolidation conversation.

## Tables

| Table | Holds |
|---|---|
| `profiles` | Advisor and staff accounts, extending `auth.users`. |
| `families` | A client household, plus its goal-gap projection assumptions. |
| `family_members` | People in the household, with WhatsApp opt-in state. |
| `holdings` | Every product, all four categories, in one table. |
| `due_instances` | One row per holding per due date, carrying payment status. |
| `reminder_rules` | Reminder windows: a default per category, overridable per holding. |
| `reminder_log` | Every reminder sent, with a database-level duplicate guard. |

## Why one holdings table

Reminders, the renewal listing, payment ticks, and the spreadsheet import are
all cross-category. A single table means each is written once, and the
renewal query is one indexed scan instead of a four-way union.
Category-specific fields live in the `details` JSONB column, validated by a
Zod schema per category in `src/lib/validation/holdings.ts`.

## Why due dates use an anchor

`holdings.anchor_due_date` is set once and never advanced automatically.
Every occurrence is computed as `anchor + (n × step)`.

Rolling forward from the previous due date would drift: a monthly policy due
on 31 January becomes 28 February, then 28 March, losing the month-end intent
permanently. Measuring from the anchor gives 28 February then 31 March.
`next_due_date` is a cached value for indexing, not the source of truth.

## Reminder routing

| Managed by | Member consent | Recipients |
|---|---|---|
| This firm | Yes | Advisor and client |
| This firm | No | Advisor only |
| Elsewhere | Either | Advisor only |

A client is never messaged about a policy this firm does not manage,
regardless of consent. Implemented in `src/lib/domain/routing.ts`.

## Sample data

`npm run db:seed-sample` inserts one reference household ("Patel —
Rajeshkumar"): three members, two life insurance policies, two general
insurance policies, two mutual funds, and two fixed-income holdings, spanning
six due dates. It is idempotent — rerunning it removes the earlier sample
family before inserting a fresh one, so it can be run repeatedly without
piling up duplicates. It depends on an advisor profile already existing, so
`npm run db:seed-admin` must run first; `npm run db:seed` runs both in order.
