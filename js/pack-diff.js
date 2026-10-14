// Pack Builder: how a new version's files relate to the live version's (docs/packs.md, Phase 6, "diff"). By hash first,
// never by name alone: the same bytes in the same place are the same file; the same bytes elsewhere were moved or
// renamed; new bytes at a path the live version had replace that file; everything else is new, and live files nothing
// matched are removed. A matched file keeps its asset (so its values, its published file id and buyers' selections
// carry over). Paths compare ignoring case, as versions already allow one name per folder ignoring case. Shared by the
// server (import) and the browser; pure, no DOM. Sets GS.packDiff in browsers, module.exports in Node.
(function (root) {
  "use strict";

  const key = (p) => String(p).normalize("NFC").toLowerCase();

  /**
   * files: the new version's [{ path, sha256 }]; base: the live version's [{ assetId, path, sha256 }].
   * Returns { matches: per file null or { assetId, change: "same" | "moved" | "replaced", from }, removed: base entries
   * nothing matched, counts: { same, moved, replaced, added, removed } }.
   */
  function match(files, base) {
    const matches = files.map(() => null);
    const used = new Set();
    const byHash = new Map();
    base.forEach((b, i) => byHash.set(b.sha256, [...(byHash.get(b.sha256) || []), i]));
    const take = (fi, bi, change) => { matches[fi] = { assetId: base[bi].assetId, change, from: base[bi].path }; used.add(bi); };
    // 1. The same bytes in the same place.
    files.forEach((f, fi) => {
      const bi = (byHash.get(f.sha256) || []).find((i) => !used.has(i) && key(base[i].path) === key(f.path));
      if (bi !== undefined) take(fi, bi, "same");
    });
    // 2. The same bytes somewhere else: moved or renamed (several copies pair up in order).
    files.forEach((f, fi) => {
      if (matches[fi]) return;
      const bi = (byHash.get(f.sha256) || []).find((i) => !used.has(i));
      if (bi !== undefined) take(fi, bi, "moved");
    });
    // 3. New bytes where a live file was: that file, replaced.
    const byPath = new Map(base.map((b, i) => [key(b.path), i]));
    files.forEach((f, fi) => {
      if (matches[fi]) return;
      const bi = byPath.get(key(f.path));
      if (bi !== undefined && !used.has(bi)) take(fi, bi, "replaced");
    });
    const removed = base.filter((_, i) => !used.has(i));
    const counts = { same: 0, moved: 0, replaced: 0, added: 0, removed: removed.length };
    for (const m of matches) counts[m ? m.change : "added"]++;
    return { matches, removed, counts };
  }

  const api = { match };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).packDiff = api;
})(typeof self !== "undefined" ? self : globalThis);
