-- The public copyright notice form (copyright-notice.html; server/copyright/filing.js; issue #137): whether the
-- claimant owns the work or acts for the owner, and the signature they typed. Notices recorded from email leave them
-- empty (the email itself holds them).
ALTER TABLE copyright_notices ADD COLUMN claimant_role TEXT NOT NULL DEFAULT '' CHECK (claimant_role IN ('', 'owner', 'agent'));
ALTER TABLE copyright_notices ADD COLUMN signature TEXT NOT NULL DEFAULT '';
