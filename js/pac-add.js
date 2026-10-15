// Pac editor: adds files to a checked, unpublished version (docs/packs.md, "Pac editor"): wraps them in a small stored
// ZIP (js/zip-make.js; a dropped or picked folder keeps its folders), or sends a dropped ZIP as it is, uploads it in the
// store's parts, and waits while the engine checks it; the store merges what it keeps into the chosen folder
// (server/packs/additions.js). GS.pacAdd.add({ base, versionId, folderId, files: [File | { name, blob }], zip, onStatus })
// → { addition, version }; throws with the store's message. Used by js/pac-drop.js and js/pac-editor.js.
// Needs js/util.js and js/zip-make.js.
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

  const entryOf = (f) => (f instanceof Blob ? { name: nameOf(f), blob: f } : f);
  const zipName = (f) => (f.name && f.name.length <= 160 && /\.zip$/i.test(f.name) ? f.name : "pac.zip");

  async function add({ base, versionId, folderId = null, files = [], zip: given = null, onStatus = () => {} }) {
    if (!given && !files.length) throw new Error("Choose files first.");
    onStatus("Preparing…");
    const zip = given || (await window.GS.zipMake.store([...files].map(entryOf), (x) => onStatus(`Preparing… ${Math.round(x * 100)}%`)));
    const made = await api(`${base}/versions/${encodeURIComponent(versionId)}/additions`, { method: "POST",
      body: { filename: given ? zipName(given) : "files.zip", size: zip.size, folderId, idempotencyKey: crypto.randomUUID() } });
    if (!made.ok) throw new Error(made.error.message);
    const { addition, upload } = made.data;
    const at = `${base}/additions/${encodeURIComponent(addition.id)}`;
    let res;
    try {
      for (let n = 1; n <= upload.parts; n++) {
        await putPart(base, upload.uploadId, n, zip.slice((n - 1) * upload.partBytes, Math.min(zip.size, n * upload.partBytes)));
        onStatus(`Uploading… ${Math.round((n / upload.parts) * 100)}%`);
      }
      res = await api(`${at}/complete`, { method: "POST", body: {} });
      if (!res.ok) throw new Error(res.error.message);
    } catch (err) {
      // Given up, so it doesn't hold the version (one addition at a time, and Publish waits for it).
      await api(at, { method: "DELETE" });
      throw err;
    }
    onStatus("Checking…");
    for (let i = 0; res.data.addition.status === "processing"; i++) {
      await wait(i < 10 ? 1500 : 4000);
      res = await api(`${base}/additions/${encodeURIComponent(addition.id)}`);
      if (!res.ok) throw new Error(res.error.message);
    }
    if (res.data.addition.status === "failed") throw new Error(`Those files couldn't be added (${res.data.addition.error || "check failed"}).`);
    return res.data;
  }

  // What wasn't added and why, in plain words (codes: engine/contract/v1/errors.json, server/packs/append.js).
  const WHY = { duplicate_name: "a file with that name is already there", case_collision: "a file with that name is already there",
    unsupported_type: "AutoStacc doesn't deliver that type", content_does_not_match_name: "it isn't the kind of file its name says",
    encrypted: "it's password-protected", symlink: "it's a link, not a file", corrupt: "it's damaged", crc_mismatch: "it's damaged",
    size_mismatch: "it's damaged", damaged_entry: "it's damaged", storage_mismatch: "it didn't store correctly; try again",
    suspicious_compression_ratio: "it expands suspiciously much", file_too_large: "it's too large" };
  function refusedText(stats) {
    const r = (stats && stats.refused) || [];
    if (!r.length) return "";
    const list = r.slice(0, 5).map((x) => `${x.path} (${WHY[x.codes[0]] || "it couldn't be checked"})`).join("; ");
    return ` Not added: ${list}${r.length > 5 ? ` and ${r.length - 5} more` : ""}.`;
  }

  window.GS.pacAdd = { add, refusedText };
})();
