// Control Center, Packs tab: uploads a Pac's ZIP in the parts the store planned (POST /api/admin/packs/:pac/versions),
// three at a time, skipping parts already there, so a dropped connection or a reload resumes instead of starting over
// (the same file and Pac reuse the same version through its idempotency key, kept in this tab's sessionStorage).
// Sets GS.packUpload.upload(pacId, productId, file, onProgress) → the version once processing has started; loads before
// js/admin-packs.js, its only user. Needs js/util.js.
(function () {
  "use strict";

  const { api } = window.GS;
  const keyFor = (pacId, file) => `gs:pack-upload:${pacId}:${file.name}:${file.size}:${file.lastModified}`;
  const remember = (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch { /* private mode: no resume */ } };
  const recall = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };

  async function putPart(uploadId, n, blob) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`/api/admin/packs/uploads/${uploadId}/parts/${n}`, {
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

  async function upload(pacId, productId, file, onProgress) {
    const memo = keyFor(pacId, file);
    const idempotencyKey = recall(memo) || crypto.randomUUID();
    remember(memo, idempotencyKey);
    const made = await api(`/api/admin/packs/${encodeURIComponent(pacId)}/versions`, {
      method: "POST", body: { productId, filename: file.name, size: file.size, idempotencyKey }
    });
    if (!made.ok) throw new Error(made.error.message);
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
        await putPart(up.uploadId, n, file.slice((n - 1) * partBytes, Math.min(file.size, n * partBytes)));
        done.add(n);
        onProgress(done.size / total);
      }
    });
    await Promise.all(workers);
    const finished = await api(`/api/admin/packs/uploads/${up.uploadId}/complete`, { method: "POST", body: {} });
    if (!finished.ok) throw new Error(finished.error.message);
    remember(memo, null);
    return finished.data.version;
  }

  window.GS.packUpload = { upload };
})();
