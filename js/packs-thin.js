// Pack Builder (Control Center and Studio): a revision uploads only what changed (docs/packs.md, Phase 6). Before
// uploading, the engine's WebAssembly build checks and hashes every file of the chosen ZIP in a few Web Workers
// (js/engine/engine-worker.js, "inspect"), the store says which hashes this owner already has (POST …/have), and the
// files it has are left out of a thin copy of the ZIP (js/zip-thin.js) and named in a carry list instead. The store
// checks the thin ZIP like any other and the carry list against its own stored originals (server/packs/carry.js).
// Sets GS.packThin.prepare(file, have, onStatus) → { blob, carry } to upload instead, or null to upload the whole file
// (nothing to leave out, or anything here failed: the whole upload always works). Needs js/util.js and js/zip-thin.js.
(function () {
  "use strict";

  const { api } = window.GS;

  // One worker's share of the files, checked and hashed; rejects if the worker fails or takes too long.
  function inspectPart(file, part, timeoutMs) {
    return new Promise((resolve, reject) => {
      const w = new Worker("/js/engine/engine-worker.js");
      const timer = setTimeout(() => { w.terminate(); reject(new Error("too slow")); }, timeoutMs);
      const done = (fn, x) => { clearTimeout(timer); w.terminate(); fn(x); };
      w.onmessage = ({ data }) => (data.result && !data.result.error ? done(resolve, data.result) : done(reject, new Error((data.result && data.result.error) || data.error || "failed")));
      w.onerror = () => done(reject, new Error("worker failed"));
      w.postMessage({ op: "inspect", file, part });
    });
  }

  /** have: { url, body } of the scope's POST …/have. onStatus(text) says what's happening. */
  async function prepare(file, have, onStatus) {
    try {
      if (typeof Worker === "undefined" || !window.GS.zipThin) return null;
      const n = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2));
      // Generous: about 5 MB a second per worker on a slow machine, never under a minute.
      const timeoutMs = 60000 + (file.size / n / (5 * 1048576)) * 1000;
      onStatus("Checking which files changed…");
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => inspectPart(file, [i, n], timeoutMs)));
      const checked = parts.flatMap((r) => r.files || []).filter((f) => f.sha256 && !f.ignored && !(f.issues || []).some((i) => i.refused));
      if (!checked.length) return null;
      const res = await api(have.url, { method: "POST", body: { ...have.body, hashes: [...new Set(checked.map((f) => f.sha256))].slice(0, 5000) } });
      if (!res.ok) return null;
      const known = new Set(res.data.known);
      if (!known.size) return null;
      // Leave out a file only where the directory entry is unmistakably the one the engine checked.
      const dir = await window.GS.zipThin.directory(file);
      const byName = new Map(dir.map((e) => [e.nameText, e]));
      const carry = [];
      const left = new Set();
      for (const f of checked) {
        const e = byName.get(f.path);
        if (!known.has(f.sha256) || !e || e.crc !== f.crc32 >>> 0 || e.usize !== f.size || left.has(e)) continue;
        carry.push({ path: f.path, sha256: f.sha256 });
        left.add(e);
      }
      if (!carry.length) return null;
      const blob = await window.GS.zipThin.thin(file, dir.filter((e) => !left.has(e)));
      onStatus(`${carry.length} file${carry.length === 1 ? " is" : "s are"} already stored; uploading the rest.`);
      return { blob, carry };
    } catch {
      return null;
    }
  }

  window.GS.packThin = { prepare };
})();
