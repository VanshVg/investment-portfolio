-- Reconciliation deletes future due instances that are still pristine and
-- regenerates them from the holding's new schedule. An instance the advisor has
-- already ticked, annotated, or that has triggered a reminder is evidence and is
-- kept instead — which leaves it sitting on a date the schedule no longer
-- contains. This column is how the listing page can say so.

alter table public.due_instances
  add column off_schedule boolean not null default false;

comment on column public.due_instances.off_schedule is
  'True when reconciliation preserved this instance because it carried a payment status, a note or a logged reminder, but its date is no longer part of the holding''s schedule. Cleared if a later edit brings the date back into the schedule.';
