-- Pack Builder revisions (docs/packs.md, Phase 6): an upload can be a thin ZIP of only the files the store doesn't
-- have yet; carry lists the files the browser left out ([{ path, sha256 }]), each checked against the owner's stored
-- originals at import (server/packs/carry.js). Forward-only: one new column with a default; nothing existing changes.
ALTER TABLE uploads ADD COLUMN carry TEXT NOT NULL DEFAULT '[]';
