// Pack Builder (Control Center and Studio): uploads a Pac's ZIP (or, for a revision, a thin copy of only what the store
// doesn't have yet, js/packs-thin.js) in the parts the store planned, three at a time,
// skipping parts already there, so a dropped connection or a reload resumes instead of starting over (the same file and
// target reuse the same version through its idempotency key, kept in this tab's sessionStorage).
// Sets GS.packUpload.upload({ base, create, body, have }, file, onProgress, onStatus) → the version once processing has
// started: base is the scope's API prefix (/api/admin/packs or /api/studio/packs), create the URL that makes a version,
// body what else it needs, have the URL and body asking which files the store has. Loads before js/admin-packs.js and js/studio-packs.js. Needs js/util.js.
(function () {
  "use strict";

  const { api } = window.GS;
  const keyFor = (create, file) => `gs:pack-upload:${create}:${file.name}:${file.size}:${file.lastModified}`;
  const remember = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* private mode: no resume */ } };
  const recall = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };

  async function putPart(base, uploadId, n, blob) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${base}/uploads/${uploadId}/parts/${n}`, {
          method: "PUT", credentials: "same-origin", body: blob, headers: { "Content-Type": "application/octet-stream" }
        });
        if (res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (res.status < 500 || attempt >= 3) throw new Error((data.error && data.error.message) || `Part ${n} failed (${res.status}).`);
      } catch (err) {
        if (attempt >= 3) throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  // have: the scope's POST …/have ({ url, body }); with it, files the store already has stay out of the upload
  // (js/packs-thin.js). onStatus(text): what's happening besides the progress bar.
  async function upload({ base, create, body = {}, have = null }, file, onProgress, onStatus = () => {}) {
    const thin = have && window.GS.packThin ? await window.GS.packThin.prepare(file, have, onStatus) : null;
    const original = file;
    if (thin) file = thin.blob;
    // The thin copy's size is part of the key: if what the store has changed since, it's a different upload.
    const memo = `${keyFor(create, original)}:${file.size}`;
    const idempotencyKey = recall(memo) || crypto.randomUUID();
    remember(memo, idempotencyKey);
    const made = await api(create, { method: "POST", body: { ...body, filename: original.name, size: file.size, idempotencyKey, ...(thin ? { carry: thin.carry } : {}) } });
    // Refused (no room, a stopped upload): the next try starts a fresh version. Offline: keep the key to resume.
    if (!made.ok) {
      if (made.status >= 400 && made.status < 500) remember(memo, null);
      throw new Error(made.error.message);
    }
    const { upload: up } = made.data;
    const partBytes = up.partBytes;
    const total = Math.max(1, Math.ceil(file.size / partBytes));
    const done = new Set(up.partsDone || []);
    const todo = [];
    for (let n = 1; n <= total; n++) if (!done.has(n)) todo.push(n);
    onProgress(done.size / total);
    // Three parts in flight at once: faster on good connections, still gentle on the store.
    const workers = Array.from({ length: Math.min(3, todo.length) }, async () => {
      while (todo.length) {
        const n = todo.shift();
        await putPart(base, up.uploadId, n, file.slice((n - 1) * partBytes, Math.min(file.size, n * partBytes)));
        done.add(n);
        onProgress(done.size / total);
      }
    });
    await Promise.all(workers);
    const finished = await api(`${base}/uploads/${up.uploadId}/complete`, { method: "POST", body: {} });
    if (!finished.ok) throw new Error(finished.error.message);
    remember(memo, null);
    return finished.data.version;
  }

  window.GS.packUpload = { upload };
})();
