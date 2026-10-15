// Pac editor: adds the files a creator picks to a checked, unpublished version (docs/packs.md, "Pac editor"): wraps them
// in a small stored ZIP (js/zip-make.js; a picked folder keeps its folders), uploads it in the store's parts, and waits
// while the engine checks it; the store merges what it keeps into the chosen folder (server/packs/additions.js).
// GS.pacAdd.add({ base, versionId, folderId, files, onStatus }) → { addition, version }; throws with the store's message.
// Used by js/pac-editor.js and the Product Studio's single-file upload. Needs js/util.js and js/zip-make.js.
(function () {
  "use strict";

  const { api } = window.GS;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function putPart(base, uploadId, n, blob) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${base}/uploads/${uploadId}/parts/${n}`, { method: "PUT", credentials: "same-origin", body: blob,
        headers: { "Content-Type": "application/octet-stream" } }).catch(() => null);
      if (res && res.ok) return;
      const data = res ? await res.json().catch(() => ({})) : {};
      if ((res && res.status < 500) || attempt >= 3) throw new Error((data.error && data.error.message) || "The upload stopped. Try again.");
      await wait(1000 * attempt);
    }
  }

  // A file's name inside the archive: its folder within a picked folder, if any.
  const nameOf = (f) => (f.webkitRelativePath && f.webkitRelativePath.includes("/") ? f.webkitRelativePath : f.name);

  async function add({ base, versionId, folderId = null, files, onStatus = () => {} }) {
    if (!files.length) throw new Error("Choose files first.");
    onStatus("Preparing…");
    const zip = await window.GS.zipMake.store([...files].map((f) => ({ name: nameOf(f), blob: f })),
      (x) => onStatus(`Preparing… ${Math.round(x * 100)}%`));
    const made = await api(`${base}/versions/${encodeURIComponent(versionId)}/additions`, { method: "POST",
      body: { filename: "files.zip", size: zip.size, folderId, idempotencyKey: crypto.randomUUID() } });
    if (!made.ok) throw new Error(made.error.message);
    const { addition, upload } = made.data;
    for (let n = 1; n <= upload.parts; n++) {
      await putPart(base, upload.uploadId, n, zip.slice((n - 1) * upload.partBytes, Math.min(zip.size, n * upload.partBytes)));
      onStatus(`Uploading… ${Math.round((n / upload.parts) * 100)}%`);
    }
    let res = await api(`${base}/additions/${encodeURIComponent(addition.id)}/complete`, { method: "POST", body: {} });
    if (!res.ok) throw new Error(res.error.message);
    onStatus("Checking…");
    for (let i = 0; res.data.addition.status === "processing"; i++) {
      await wait(i < 10 ? 1500 : 4000);
      res = await api(`${base}/additions/${encodeURIComponent(addition.id)}`);
      if (!res.ok) throw new Error(res.error.message);
    }
    if (res.data.addition.status === "failed") throw new Error(`Those files couldn't be added (${res.data.addition.error || "check failed"}).`);
    return res.data;
  }

  window.GS.pacAdd = { add };
})();
