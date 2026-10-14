// Automated review of a version (docs/packs.md, "Automated review"; owner's decision: only flagged versions wait for an
// admin). From what the engine and the import found, flags with a reason: hard ones always hold the version for an
// admin; soft ones hold it unless the creator is trusted. What automation can't judge (rights to the sounds, their
// quality) stays with reports and spot checks. Pure, for tests; the import stores the result in the version's stats.
const UNSAFE = new Set(["path_traversal", "absolute_path", "control_characters", "reserved_name", "symlink", "suspicious_compression_ratio", "overlapping_entries", "damaged_entry"]);
const DAMAGED = new Set(["crc_mismatch", "size_mismatch", "corrupt"]);
// Never sold, and a sign the archive isn't what it claims: programs and scripts.
export const EXECUTABLE = new Set(["exe", "dll", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "js", "jar", "sh", "app", "apk", "dmg", "pkg", "deb", "rpm"]);

const ARCHIVE = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"]);
const ext = (path) => (String(path).match(/\.([a-z0-9]{1,12})$/i) || [])[1]?.toLowerCase() || "";

/**
 * result: the engine's answer; kept / refused: the import's split ({ path, codes } for refused); existingHashes: how many
 * kept files the owner already had stored elsewhere before this version; revision: how much of the live version this
 * one drops ({ files, bytes, removed, goneBytes }: removed files, and bytes of removed or replaced files) or null. Returns { verdict: "pass" | "hold", flags: [{ code, hard, count, examples }] }.
 */
export function review({ result, kept, refused, existingHashes = 0, revision = null }) {
  const flags = [];
  const flag = (code, hard, paths) => paths.length && flags.push({ code, hard, count: paths.length, examples: paths.slice(0, 5) });
  const refusedWith = (set) => refused.filter((r) => r.codes.some((c) => set.has(c))).map((r) => r.path);
  flag("unsafe_entries", true, refusedWith(UNSAFE));
  flag("deceptive_files", true, refusedWith(new Set(["content_does_not_match_name"])));
  flag("damaged_files", true, refusedWith(DAMAGED));
  flag("encrypted_files", true, refusedWith(new Set(["encrypted"])));
  flag("executables", true, (result.files || []).filter((f) => !f.ignored && EXECUTABLE.has(ext(f.path))).map((f) => f.path));
  flag("unsupported_files", false, refusedWith(new Set(["unsupported_type"])));
  // Archives inside the pack aren't opened by the checks, so what they hold is unreviewed (a single upload of one waits
  // for approval too).
  flag("nested_archives", false, kept.filter((f) => ARCHIVE.has(ext(f.path))).map((f) => f.path));
  const unknown = kept.filter((f) => !f.format || f.format === "unknown").map((f) => f.path);
  if (kept.length && unknown.length / kept.length > 0.5) flag("mostly_unknown_formats", false, unknown);
  if (kept.length && existingHashes === kept.length) flag("all_duplicates", false, kept.map((f) => f.path));
  // From listening to the audio (engine analysis, when switched on): a pack whose audio is largely silence or can't be
  // decoded isn't what it claims (renamed or broken files). A stray one is normal; over a quarter of the audio holds.
  const heard = kept.filter((f) => f.analysis || (f.issues || []).some((i) => i.code === "audio_does_not_decode"));
  for (const [code, issue] of [["silent_audio", "silent_audio"], ["undecodable_audio", "audio_does_not_decode"]]) {
    const hit = heard.filter((f) => (f.issues || []).some((i) => i.code === issue)).map((f) => f.path);
    if (heard.length && hit.length / heard.length > 0.25) flag(code, false, hit);
  }
  const r = revision;
  if (r && r.files && (r.removed / r.files > 0.25 || (r.bytes && r.goneBytes / r.bytes > 0.5))) {
    flags.push({ code: "big_revision", hard: false, count: r.removed, examples: [] });
  }
  return { verdict: flags.length ? "hold" : "pass", flags };
}

/** Whether a version may go live without an admin: no flags, or only soft ones for a trusted creator. No review at all
 * (a version checked before reviews existed) holds. */
export const clearToPublish = (rv, { trusted = false, alwaysHold = false } = {}) =>
  !alwaysHold && Boolean(rv) && (rv.verdict === "pass" || (trusted && rv.flags.every((f) => !f.hard)));
