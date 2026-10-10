-- Automated review of Pack Builder versions (docs/packs.md, Phase 5): an admin can set a creator to "always hold", so
-- every version they publish waits for an admin even when the automated review finds nothing. Forward-only.
ALTER TABLE creators ADD COLUMN pack_review TEXT NOT NULL DEFAULT 'auto' CHECK (pack_review IN ('auto', 'always_hold'));
CREATE INDEX pac_versions_review ON pac_versions(status) WHERE status = 'in_review';
