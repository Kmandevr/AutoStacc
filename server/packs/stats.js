// A version's counts kept true as it's built in steps (docs/packs.md, "Pac editor"): after files are added (append.js),
// removed or a folder made (tree-edits.js), its files, bytes and folders are counted again from the manifest itself.
// The creator's storage counts the version from its stored originals (creators/storage.js), not from these numbers;
// they are what the builder and review show.
import { stmt } from "../lib/db.js";

export const restatStmt = (db, versionId) => stmt(db, `UPDATE pac_versions SET stats = json_set(COALESCE(stats, '{}'),
    '$.files', (SELECT COUNT(*) FROM pac_entries WHERE version_id = ?1),
    '$.bytes', (SELECT COALESCE(SUM(b.size_bytes), 0) FROM pac_entries e JOIN blobs b ON b.id = e.blob_id WHERE e.version_id = ?1),
    '$.folders', (SELECT COUNT(*) FROM pac_folders WHERE version_id = ?1)), updated_at = ?2 WHERE id = ?1`, versionId, new Date().toISOString());
