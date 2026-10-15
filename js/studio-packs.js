// Studio Pack Builder (GS.studioPacks, for js/studio-products.js; docs/packs.md, Phase 5): a creator drops their
// product's contents in (with the Pac editor on, one drop zone for a file, a folder or a whole ZIP, js/pac-drop.js, that
// opens in the visual builder, js/pac-editor.js; otherwise one ZIP), sees what the checks kept, refused and flagged, reviews the suggested kinds,
// instruments, tempos and keys, and publishes. A clean version goes live at once; a flagged one waits for AutoStacc's
// review (the server decides, this only shows its answer). Shows the creator's file storage. Talks to
// /api/studio/packs; uses js/packs-upload.js, js/packs-preview.js, js/packs-version.js, js/packs-review.js, and the
// Pac editor (js/pac-editor.js, js/pac-previews.js) to build it one file at a time.
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const BASE = "/api/studio/packs";
  const mb = (n) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
  const STATE = { ready: "checked", in_review: "waiting for review", published: "published", superseded: "replaced", failed: "failed", discarded: "discarded",
    processing: "checking", uploading: "uploading", draft: "draft" };

  // The one drop zone and the visual builder (js/pac-drop.js) replace the ZIP form when the Pac editor is on.
  const dropping = () => Boolean(window.FEATURES && window.FEATURES["packs.editor"] && window.GS.pacDrop && window.GS.pacEditor);
  const enabled = () => Boolean(window.FEATURES && window.FEATURES["packs.builder"] && window.GS.packUpload && window.GS.packVersion);

  function open(root, productId, onBack) {
    let poll;
    // This view replaces the products list: its handlers on root must not see our events.
    root.onclick = root.onchange = root.onsubmit = null;
    root.innerHTML = `<div class="studio-packs">
        <div class="studio-bar"><button class="btn ghost" type="button" data-pack-back>&larr; Products</button><h2>Pack Builder</h2></div>
        ${dropping() ? "<div data-pac-drop></div>" : ""}
        <div data-pack-body><p class="msg pending">Loading…</p></div></div>`;
    const el = $(".studio-packs", root);
    const url = `${BASE}/products/${encodeURIComponent(productId)}`;
    if (dropping()) window.GS.pacDrop.mount($("[data-pac-drop]", el), { base: BASE, draft: { url: `${url}/drafts`, body: {} },
      upload: { create: `${url}/versions`, have: { url: `${url}/have`, body: {} } }, info: () => api(url), onOpen: () => show() });

    function draw(v) {
      const box = $("[data-pack-version]", el);
      box.dataset.id = v.id;
      box.__version = v;
      box.innerHTML = window.GS.packVersion.render(v);
      editor(v);
    }

    // The Pac as a file manager (js/pac-editor.js) above the version, and its preview clips (js/pac-previews.js).
    function editor(v) {
      if (!window.GS.pacEditor) return;
      window.GS.pacEditor.attach($("[data-pac-editor]", el), v, { base: BASE, draft: { url: `${url}/drafts`, body: {} },
        onChanged: draw, reload: async (id) => { await show(); showVersion(id); } });
      const pp = $("[data-pac-previews]", el);
      if (pp && window.GS.pacPreviews && !pp.dataset.mounted) {
        pp.dataset.mounted = "1";
        window.GS.pacPreviews.mount(pp, { url: `${url}/previews`, base: BASE, version: () => $("[data-pack-version]", el).__version || null });
      } else if (pp && pp.refresh) pp.refresh();
    }

    async function showVersion(id) {
      clearTimeout(poll);
      const res = await api(`${BASE}/versions/${encodeURIComponent(id)}`);
      const box = $("[data-pack-version]", el);
      if (!box) return;
      if (!res.ok) { box.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      draw(res.data.version);
      if (res.data.version.status === "processing") poll = setTimeout(() => showVersion(id), 2500);
    }

    async function show() {
      clearTimeout(poll);
      const body = $("[data-pack-body]", el);
      const res = await api(url);
      if (!res.ok) { body.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      const { pac, versions, product, storage } = res.data;
      const busy = Boolean(pac && pac.draftVersionId);
      const intro = dropping()
        ? `<p class="small-print"><strong>${e(product.title)}</strong>. AutoStacc checks every file you drop in (type, damage, unsafe names), keeps the originals byte for byte and suggests kinds, instruments, tempos and keys. When it looks right, publish: a clean Pac goes live at once; anything flagged waits for AutoStacc's review.</p>`
        : "";
      body.innerHTML = dropping() ? `${intro}
        <p class="small-print">File storage: ${mb(storage.usedBytes)} of ${mb(storage.quotaBytes)} used.</p>` : `
        <p class="small-print"><strong>${e(product.title)}</strong>. Upload everything buyers get as one ZIP, in the folders you want them to see. AutoStacc checks every file (type, damage, unsafe names), keeps the originals byte for byte and suggests kinds, instruments, tempos and keys. Clean packs publish right away; anything flagged waits for AutoStacc's review.</p>
        <p class="small-print">File storage: ${mb(storage.usedBytes)} of ${mb(storage.quotaBytes)} used.</p>
        <form class="panel" data-pack-form>
          <div class="field"><label for="spk-file">The contents as one ZIP</label><input id="spk-file" name="file" type="file" accept=".zip,application/zip" required data-pack-file></div>
          <div data-pack-preview aria-live="polite"></div>
          <div class="actions"><button class="btn" type="submit"${busy ? " disabled data-locked" : ""}>Upload and check</button></div>
          <progress max="1" value="0" hidden></progress><p class="msg" role="status">${busy ? "A version is in progress below: publish or discard it first." : ""}</p>
        </form>`;
      body.innerHTML += `
        <div data-pac-editor></div>
        <div data-pack-version></div>
        <div data-pac-previews></div>
        ${versions.length ? `<h3>Versions</h3><ul class="plain">${versions.map((v) => `<li><button class="link-btn" type="button" data-pack-open="${e(v.id)}">Version ${v.number}</button>
          · ${e(STATE[v.status] || v.status)}${pac && v.id === pac.liveVersionId ? " · live" : ""}${v.stats && v.stats.files !== undefined ? ` · ${v.stats.files} files` : ""}${v.note ? ` · ${e(v.note)}` : ""}</li>`).join("")}</ul>` : ""}`;
      const current = pac && (pac.draftVersionId || pac.liveVersionId);
      if (current) showVersion(current);
      else editor(null);
    }

    el.addEventListener("change", async (ev) => {
      const input = ev.target.closest("[data-pack-file]");
      if (!input) return;
      const box = $("[data-pack-preview]", el);
      const file = input.files[0];
      if (!file) { box.innerHTML = ""; return; }
      box.innerHTML = `<p class="small-print">Looking inside ${e(file.name)}…</p>`;
      const { result, error } = await window.GS.packPreview.list(file);
      const submit = $("[data-pack-form] button[type=submit]", el);
      if (error || !result) { box.innerHTML = `<p class="small-print">No preview here; the upload is checked in full anyway.</p>`; return; }
      if (result.error) {
        box.innerHTML = `<p class="msg error">This isn't a ZIP AutoStacc can read. Choose another file.</p>`;
        if (submit) submit.disabled = true;
        return;
      }
      if (submit && !submit.dataset.locked) submit.disabled = false;
      const files = result.files.filter((f) => !f.ignored);
      const refused = files.filter((f) => f.issues.some((i) => i.refused));
      box.innerHTML = `<p>${files.length} file${files.length === 1 ? "" : "s"} in ${result.folders.length} folder${result.folders.length === 1 ? "" : "s"}, ${mb(files.reduce((n, f) => n + f.size, 0))} unpacked.</p>
        ${refused.length ? `<details open><summary>${refused.length} would be refused</summary><ul>${refused.slice(0, 50).map((f) =>
          `<li><code>${e(f.path)}</code>: ${e(f.issues.filter((i) => i.refused).map((i) => i.code).join(", "))}</li>`).join("")}</ul></details>` : ""}`;
    });

    el.addEventListener("submit", async (ev) => {
      const form = ev.target.closest("[data-pack-form]");
      if (!form) return;
      ev.preventDefault();
      const file = form.elements.file.files[0];
      const msg = $("[role=status]", form), bar = $("progress", form), btn = $("button[type=submit]", form);
      if (!file) return;
      btn.disabled = true;
      bar.hidden = false;
      msg.textContent = "Uploading…";
      try {
        let note = "";
        const v = await window.GS.packUpload.upload({ base: BASE, create: `${url}/versions`, have: { url: `${url}/have`, body: {} } }, file,
          (x) => { bar.value = x; msg.textContent = `${note} Uploading… ${Math.round(x * 100)}%`.trim(); }, (t) => { note = t; msg.textContent = t; });
        await show();
        showVersion(v.id);
      } catch (err) {
        msg.textContent = `${err.message} Choose the same file again to continue where it stopped.`;
        btn.disabled = false;
      }
    });

    el.addEventListener("click", async (ev) => {
      // Stopped here: going back redraws the products list, whose own handler on root would see this click too.
      if (ev.target.closest("[data-pack-back]")) { ev.stopPropagation(); clearTimeout(poll); return onBack(); }
      const openV = ev.target.closest("[data-pack-open]");
      if (openV) return showVersion(openV.dataset.packOpen);
      const act = ev.target.closest("[data-pack-publish], [data-pack-discard]");
      if (!act) return;
      const id = $("[data-pack-version]", el).dataset.id;
      const publishing = act.hasAttribute("data-pack-publish");
      if (publishing && !confirm("Publish this version? Buyers get its files once it's live; files you changed or removed are replaced.")) return;
      if (!publishing && !confirm("Discard this version? Its upload is deleted; the live version stays as it is.")) return;
      act.disabled = true;
      const res = await api(`${BASE}/versions/${encodeURIComponent(id)}/${publishing ? "publish" : "discard"}`, { method: "POST", body: {} });
      if (!res.ok) {
        act.disabled = false;
        act.closest(".actions").insertAdjacentHTML("afterend", `<p class="msg error" role="alert">${e(res.error.message)}</p>`);
        return;
      }
      await show();
      if (res.status === 202) {
        const m = $("[data-pack-form] [role=status]", el);
        if (m) m.textContent = "Sent to AutoStacc for review. You'll see the result here.";
      }
    });

    window.GS.packReview.bind(el, draw, BASE);
    show();
  }

  window.GS.studioPacks = { open, enabled };
})();
