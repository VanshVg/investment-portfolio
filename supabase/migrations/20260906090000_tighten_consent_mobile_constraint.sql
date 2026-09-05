-- family_members_consent_needs_mobile checked `mobile is not null`, which an
-- empty string satisfies. A direct insert of mobile: '' with whatsapp_consent
-- true was accepted and fired stamp_consent_time, leaving a DPDP consent
-- record against a number nobody can be reached on. The app itself cannot
-- trigger this today (optionalIndianMobile maps '' to null before it reaches
-- the database), but anything that writes to this table directly — the
-- Excel importer, a seed script, a future consent-only toggle action — is
-- not guarded by that validator, so the database constraint should not
-- accept it either.

alter table public.family_members
  drop constraint family_members_consent_needs_mobile,
  add  constraint family_members_consent_needs_mobile
    check (not whatsapp_consent or (mobile is not null and mobile <> ''));
