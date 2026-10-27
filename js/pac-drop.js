// Pac editor: the one drop zone (owner, 2026-10-15): drop (or choose) one file, many, a folder or a whole Pac as a ZIP,
// and it opens in the builder; nothing reaches buyers until Publish. A whole Pac (a ZIP or a folder) dropped on a Pac
// that already has files asks each time: replace the Pac with it (a new version made from the drop alone, its files
// matched to the live ones by their bytes) or add its files. Otherwise the files join the open draft, or a new one
// copied from the live version. A ZIP that becomes the whole Pac (into an empty Pac, or replacing it) goes up as a new
// version (js/packs-upload.js: listed in the browser first, and on a revision only the files that changed upload), and
// opens in the builder once checked. GS.pacDrop.mount(box, { base, draft: { url, body }, upload: { create, body, have }
// (js/packs-upload.js), info: () => GS.api(the Pac's own url: { pac, versions }), onOpen(versionId|null: reload) });
// GS.pacDrop.read(dataTransfer) → [{ name, blob }] (folders kept). Needs js/util.js and js/pac-add.js
// (js/packs-upload.js and js/packs-preview.js for whole ZIPs; without them a ZIP is added like any files).
(function () {
  "use strict";

  const { $, api } = window.GS;
  const isZip = (f) => /\.zip$/i.test(f.name);
  // The store's own limits (server/creators/policy.js LIMITS), checked here first so nothing uploads in vain.
  const MAX_FILES = 2000, MAX_FILE = 4 * 1024 ** 3;
  const mb = (n) => `${Math.round(n / 1048576).toLocaleString()} MB`;
  const notes = new Map(); // the last word per Pac, kept when the page redraws the zone after a drop

  // Every file of a drop, with its path inside what was dropped (directory entries read in full, in batches).
  async function read(dt) {
    const out = [];
    const entries = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    if (!entries.length || entries.some((x) => !x)) return [...(dt.files || [])].map((f) => ({ name: f.name, blob: f }));
    const walk = async (entry, at) => {
      if (entry.isFile) return out.push({ name: at + entry.name, blob: await new Promise((ok, no) => entry.file(ok, no)) });
      const reader = entry.createReader();
      for (let batch; (batch = await new Promise((ok, no) => reader.readEntries(ok, no))).length;) for (const x of batch) await walk(x, `${at}${entry.name}/`);
    };
    for (const x of entries) await walk(x, "");
    return out;
  }

  // A picked folder's files, named by their place in it.
  const picked = (files) => [...files].map((f) => ({ name: f.webkitRelativePath || f.name, blob: f }));

  // A whole Pac is a ZIP alone, or one folder (its own name dropped, so its contents are the Pac).
  function shape(files) {
    if (files.length === 1 && isZip(files[0].blob)) return { whole: true, zip: files[0].blob };
    const roots = new Set(files.map((f) => (f.name.includes("/") ? f.name.split("/")[0] : "")));
    if (roots.size === 1 && !roots.has("")) {
      const cut = [...roots][0].length + 1;
      return { whole: true, files: files.map((f) => ({ name: f.name.slice(cut), blob: f.blob })) };
    }
    return { whole: false, files };
  }

  function mount(box, opts) {
    if (!box || !window.GS.pacAdd) return;
    box.innerHTML = `<div class="pd" data-pd>
        <p class="pd-title">Drop files, a folder or a whole Pac (ZIP) here</p>
        <p class="small-print">It all opens in the builder, where you can arrange it. Buyers get the files only when you publish (preview clips are public as soon as you save them).</p>
        <div class="actions"><button class="btn small" type="button" data-pd-pick="files">Choose files</button>
          <button class="btn ghost small" type="button" data-pd-pick="folder">Choose a folder</button>
          <input type="file" multiple hidden data-pd-files><input type="file" webkitdirectory multiple hidden data-pd-folder></div>
        <div class="pd-ask" data-pd-ask hidden></div>
        <div class="small-print" data-pd-preview aria-live="polite"></div>
        <progress max="1" value="0" hidden aria-label="Upload progress" data-pd-progress></progress>
        <p class="msg" role="status" tabindex="-1" data-pd-status></p></div>`;
    const zone = $("[data-pd]", box);
    const say = (t, error) => {
      const m = $("[data-pd-status]", box);
      notes.set(opts.draft.url, { t, error });
      if (m) { m.textContent = t; m.classList.toggle("error", Boolean(error)); }
    };
    const last = notes.get(opts.draft.url);
    if (last) say(last.t, last.error);
    const inputs = () => box.querySelectorAll("input[type=file], [data-pd-pick]");
    let busy = false;

    // Replace or add, asked in the zone itself. → "replace" | "add" | null (cancelled).
    const ask = () => new Promise((done) => {
      const el = $("[data-pd-ask]", box);
      el.hidden = false;
      el.innerHTML = `<p>This is a whole Pac, and yours already has files. What should happen?</p>
        <div class="actions"><button class="btn small" type="button" data-pd-choice="replace">Replace the Pac with this</button>
          <button class="btn ghost small" type="button" data-pd-choice="add">Add these files</button>
          <button class="link-btn" type="button" data-pd-choice="">Cancel</button></div>
        <p class="small-print">Replacing starts a new version from this drop alone (an unpublished draft is discarded). Files with the same bytes stay the same files for buyers.</p>`;
      $("[data-pd-choice]", el).focus();
      const answer = (choice) => {
        el.hidden = true;
        el.innerHTML = "";
        el.onclick = el.onkeydown = null;
        $("[data-pd-status]", box).focus();
        done(choice);
      };
      el.onclick = (ev) => { const b = ev.target.closest("[data-pd-choice]"); if (b) answer(b.dataset.pdChoice || null); };
      el.onkeydown = (ev) => { if (ev.key === "Escape") answer(null); };
    });

    async function start(empty) {
      const d = await api(opts.draft.url, { method: "POST", body: { ...opts.draft.body, idempotencyKey: crypto.randomUUID(), ...(empty ? { empty: true } : {}) } });
      if (!d.ok) throw new Error(d.error.message);
      return d.data.version.id;
    }

    // A whole ZIP's contents, listed in the browser; throws (before anything changes) if it can't be read.
    async function list(zip) {
      const r = window.GS.packPreview ? (await window.GS.packPreview.list(zip)).result : null;
      if (r && r.error) throw new Error("This isn't a ZIP AutoStacc can read. Choose another file.");
      if (r) {
        const kept = r.files.filter((f) => !f.ignored), refused = kept.filter((f) => f.issues.some((i) => i.refused)).length;
        $("[data-pd-preview]", box).textContent = `${kept.length} file${kept.length === 1 ? "" : "s"} in ${r.folders.length} folder${r.folders.length === 1 ? "" : "s"}${refused ? `; ${refused} would be refused` : ""}.`;
      }
    }

    // A whole ZIP as a new version (the progress bar shows the bytes; the status says only each stage).
    async function version(zip) {
      const bar = $("[data-pd-progress]", box);
      bar.hidden = false;
      try {
        const v = await window.GS.packUpload.upload({ base: opts.base, ...opts.upload }, zip, (x) => { bar.value = x; }, (t) => say(t));
        return v.id;
      } finally { bar.hidden = true; }
    }

    async function take(files) {
      if (busy) return say("Still working on the last drop…");
      if (!files.length) return;
      busy = true;
      inputs().forEach((x) => (x.disabled = true));
      $("[data-pd-preview]", box).textContent = "";
      let versionId = null, discarded = false;
      try {
        const s = shape(files);
        const loose = s.zip ? [] : files;
        if (loose.length > MAX_FILES) throw new Error(`That's ${loose.length.toLocaleString()} files; a Pac holds up to ${MAX_FILES.toLocaleString()}. Split it into more than one Pac.`);
        const big = (s.zip ? [] : files).filter((f) => f.blob.size > MAX_FILE);
        if (big.length) throw new Error(`Files over 4 GB can't go into a Pac yet: ${big.slice(0, 3).map((f) => f.name).join(", ")}${big.length > 3 ? "…" : ""}.`);
        const res = await opts.info();
        if (!res.ok) throw new Error(res.error.message);
        const { pac, versions = [], storage } = res.data;
        // A creator's storage: a warning, not a refusal (files the store already has, and replaced ones, count once).
        const size = s.zip ? s.zip.size : files.reduce((n, f) => n + f.blob.size, 0);
        if (storage && storage.quotaBytes && size > storage.quotaBytes - storage.usedBytes
          && !await window.GS.confirm(`This drop is ${mb(size)} and your file storage has ${mb(Math.max(0, storage.quotaBytes - storage.usedBytes))} free. Files AutoStacc already has count once, so it may still fit. Try anyway?`)) return say("");
        const byId = (id) => id && versions.find((v) => v.id === id);
        const draft = pac && byId(pac.draftVersionId), live = pac && byId(pac.liveVersionId);
        const has = [draft, live].some((v) => v && v.stats && v.stats.files > 0);
        const choice = s.whole && has ? await ask() : "add";
        if (!choice) return say("");
        if (draft && draft.status !== "ready") throw new Error("A version of this Pac is still being checked or reviewed: wait for it, or discard it, first.");
        const whole = s.zip && opts.upload && window.GS.packUpload && (choice === "replace" || !has);
        // Checked before the draft goes: a ZIP that can't be read changes nothing.
        if (s.zip) await list(s.zip);
        // Replacing needs the draft gone first (one version in progress per Pac), so a draft with work in it is confirmed.
        if (draft && (choice === "replace" || whole) && draft.stats && draft.stats.files > 0
          && !await window.GS.confirm("Discard your unpublished draft first? Its arrangement, renames, folders, folder defaults and read me are lost, even if this upload then fails. Values you set on files stay with them. The live version buyers have doesn't change.")) return say("");
        if (draft && (choice === "replace" || whole)) {
          const gone = await api(`${opts.base}/versions/${encodeURIComponent(draft.id)}/discard`, { method: "POST", body: {} });
          if (!gone.ok) throw new Error(gone.error.message);
          discarded = true;
        }
        if (whole) {
          versionId = await version(s.zip);
          return say("Uploaded. Checking every file… it opens below when it's done.");
        }
        versionId = choice === "replace" ? await start(true) : draft ? draft.id : await start(false);
        // Added as dropped: a folder keeps its name (only replacing makes its contents the whole Pac).
        const add = choice === "replace" ? s : { files: s.zip ? [] : files, zip: s.zip };
        const out = await window.GS.pacAdd.add({ base: opts.base, versionId, files: add.files || [], zip: add.zip || null, onStatus: (t) => say(t) });
        const refused = window.GS.pacAdd.refusedText(out.addition.stats);
        const n = (out.addition.stats || {}).files || 0;
        say(`${n} file${n === 1 ? "" : "s"} added. Arrange them below, then publish.${refused}`, Boolean(refused));
      } catch (err) {
        say(discarded && !versionId ? `${err.message} Your earlier draft was already discarded; the live version is unchanged. Drop the files again to retry.` : err.message, true);
      } finally {
        busy = false;
        inputs().forEach((x) => { x.disabled = false; x.value = ""; });
        if (versionId || discarded) opts.onOpen(versionId);
      }
    }

    zone.addEventListener("dragover", (ev) => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes("Files")) { ev.preventDefault(); zone.classList.add("over"); } });
    zone.addEventListener("dragleave", (ev) => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove("over"); });
    zone.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      zone.classList.remove("over");
      take(await read(ev.dataTransfer));
    });
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pd-pick]");
      if (b) $(b.dataset.pdPick === "folder" ? "[data-pd-folder]" : "[data-pd-files]", box).click();
    });
    box.addEventListener("change", (ev) => {
      const input = ev.target.closest("[data-pd-files], [data-pd-folder]");
      if (input && input.files.length) take(picked(input.files));
    });
  }

  window.GS.pacDrop = { mount, read, shape };
})();
