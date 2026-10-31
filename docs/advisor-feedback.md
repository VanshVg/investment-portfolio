# Advisor review feedback

From the advisor's walkthrough of the app. Recorded as given, with what each
item implies for the schema or the UI. Nothing here is built yet.

Three of these answer questions the importer was blocked on — see
`docs/importer-questions.md`.

## People and households

**More relations; date of birth, age, address.**
`family_members` has `relation` as an enum (self/spouse/son/daughter/other) and
no date of birth; `families` has no address, only `notes`. Age should be derived
from the date of birth, not stored, or it is wrong within a year. Both the life
and general sheets carry an address, and the general sheet carries a date of
birth, so this also unblocks importing columns that currently have nowhere to go.

**Multi-select for family members.**
Today `holdings.member_id` is a single nullable reference. He wants a holding to
cover several people. This is the largest change in the list: it needs a join
table, and it ripples into who a reminder is sent to, the soft-delete rules for a
removed member, and the renewals listing's member filter.

## Life insurance

**Premium paying term and policy term, separately.**
`lifeInsuranceDetails` has one `term_years`. He distinguishes the two, which is
exactly the ambiguity that made 517 rows of the import unreadable — and it means
the sheet's single term column is one of the two, still to be confirmed which.

**Frequency dropdown: yearly, half-yearly, quarterly, monthly, single premium.**
The `due_frequency` enum already holds these five. This is a UI label change, and
it confirms single premium is a first-class choice rather than an absence.

## General insurance

**Health only: individual, multi-individual, or floater** — with a table showing
the amount per person. A floater shares one sum assured across several people; a
multi-individual gives each person their own amount, which may or may not match.
This needs the member multi-select above plus a per-member amount, so the two
items have to be built together.

**Remove insured asset from health.**
`generalInsuranceDetails.insured_asset` is currently required for every
sub-category, which is also what blocked importing the 53 health rows that have
no asset to name.

## Mutual funds

- Rename **Next SIP** to **SIP date**.
- **Remove current value.**
- Add a **client link**.
- Add a **type**: one for a SIP, one for a single purchase (name not yet chosen).
- For the single-purchase type, **drop the date** and rename *monthly SIP* to
  **amount**.

`mutualFundDetails` has no type field, and `principal_amount` is what current
value maps to today, so removing it needs a decision about existing rows.

## Fixed income

- **Calculate the maturity amount** rather than asking for it. `maturity_amount`
  is currently entered by hand and feeds the renewals "amount due" under decision
  D4, so that decision needs revisiting.
- Add a **payout frequency** dropdown: cumulative or payout.
- **Adjust the frequency options based on that choice** — a cumulative deposit
  pays only at maturity, so it has no payout frequency to offer.

## New: demat accounts

Company name (required), family member (required), BO ID. Not one of the four
existing categories. Needs a decision: a fifth category, or a sub-type of fixed
income.

## Also raised

**External links to blogs and YouTube** explaining the different policy types, so
a client can read up on what they hold. Needs a decision on where these live —
per category, per holding, or one reference page.
