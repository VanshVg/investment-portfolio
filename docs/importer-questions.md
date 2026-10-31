# Questions for the advisor before the import is built

Drawn from reading his own export: a life sheet (1,434 policies), a general
insurance sheet (134), an LIC first-unpaid-premium report (162 rows) and two
working sheets. Nothing here needs a technical answer — every one is a question
about how he works.

Counts only, no client details: this file is version-controlled.

## The five that block the build

### 1. How should households be named?

The point of the import is to group his book into families, and he is the only
one who knows the grouping. The sheet cannot carry it today: 272 different
group labels across 1,094 rows, **340 rows with no label at all**, and labels
that cannot be resolved by anyone else — one reading "family", another "uncle's
family", several that are shop names rather than households.

He will be asked to fill one new column, one consistent label per household, on
every row. **What should the label be** — the head of the family's full name, or
something else he would recognise faster? The importer will create exactly one
family per distinct label, so two spellings make two families.

### 2. Does a business belong to a family?

Several rows are in a business name rather than a person's. Should each of those
sit inside the owner's household, or stand on its own as a separate client?

### 3. How can we tell a policy has already matured?

He wants matured policies kept as history — visible on the family's page, never
generating a reminder. But nothing in the sheet marks them.

Taking the commencement date plus the term column, **517 of 1,434 policies (36%)
are already past their term.** Before trusting that:

- Is the **term** column the policy term, or the premium-paying term? On
  whole-life plans the two differ, and several hundred rows are on plans where
  that distinction matters. **Partly answered:** his review asked for both to be
  recorded separately, so the distinction is real to him — what is still needed
  is which of the two the sheet's single column holds.
- 143 policies are marked single-premium. Are those finished, or still live
  investments he wants reminders about?
- Nine rows have "maturity" or "maturity paid" typed into the mode column. Is
  that his way of marking one closed?

If this is wrong in either direction, either a third of the book shows phantom
renewals, or live policies go quiet.

### 4. Which policies count as his, for reminders?

This decides who gets messaged. For a policy he manages, the reminder goes to
**both him and the client**; for one managed elsewhere, **to him only**, as a
cross-sell prompt. The client must never be messaged about a policy he does not
manage.

The agent column reads: 811 rows under one other agent's name, 162 under his
own, 90 marked "other agent", **464 blank**, and a dozen one-offs including
three different spellings of the same name.

- **What does blank mean?**
- The 811 under the other agent's name — is that a book he services (so his
  clients, who may be messaged) or genuinely someone else's?

### 5. Has he got WhatsApp consent, and how will he collect it?

No client-facing reminder can be sent without the recipient's opt-in. This is
both WhatsApp's rule and the DPDP Act's. Until consent is recorded per person,
**every reminder goes to him alone** and the tool is a private diary.

Has he already got consent from anyone? How does he want to ask — a one-off
message to each client, or in person as he meets them?

## Contact details

The reminders need numbers, and most rows have none.

- **544 of 1,434** life rows and **98 of 134** general rows have no mobile.
  Does he have these somewhere else?
- Only 235 distinct numbers appear for 897 distinct names. Is one number per
  household the norm, with the head of the family receiving everything? That is
  what the tool will assume unless he says otherwise.
- Will he fill in each person's relation to the head of the family — self,
  spouse, son, daughter? Without it everyone imports as "other".

## Reminder timing

Still undecided, and needed before the first reminder goes out.

- **How many days before a due date, and how many reminders?** Thirty days and
  fifteen is the common pattern; his call.
- Should a monthly or quarterly premium prompt a reminder every cycle, or only
  once a year? Nearly half the life book is half-yearly or monthly, so this sets
  whether he gets a handful of messages a month or a few hundred.

## The general insurance sheet

- **Rows 104 to 137 are in a different column order from the rest of the
  sheet** — 33 rows that look pasted in from a broker's statement, with the
  insurer's name sitting where the policy number belongs. Where did that block
  come from, and can it be re-entered in the sheet's own columns? Otherwise
  those 33 policies have to be skipped.
- Five rows are marked **WC** and four **PA**. Should workmen's compensation and
  personal accident be filed as health, as vehicle, or as their own kind?
- ~~Vehicle policies name the vehicle; **health policies name nothing**. What
  should a health policy be labelled by?~~ **Answered in his review:** the
  insured-asset field is being removed from health altogether, and health
  policies gain individual / multi-individual / floater with the people covered
  named instead. The 53 health rows stop being a problem.
- **55 rows link the policy PDF on Google Drive.** Should the tool keep those
  links, so a policy opens its own document?
- 26 rows have no end date, so no renewal can be scheduled. Can he fill them?

## Gaps in the data

- **No mutual funds and no fixed income appear anywhere in the file.** Where
  does he track SIPs, funds, deposits and bonds today? The family report has a
  goal-gap section that stays empty until that data exists.
- 26 life rows have no commencement date, so no schedule can be derived from
  them. Fill, or leave out?
- The status column is empty on every row. Safe to drop?
