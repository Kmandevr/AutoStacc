// Studio products (GS.studioProducts, for js/studio.js): a creator's products for one project. Make one (always starts
// as a draft), change its name, description, kind, price (0 = free), what's inside, tags and cover art, upload the files
// buyers get and a preview clip, then put it on sale, pause sales or remove it. The server checks every field and limit
// (server/studio/products.js) and decides what is on sale; this only shows its answers. A whole pack (ZIP, in folders)
// goes through the Pack Builder (js/studio-packs.js) when it's on. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const KINDS = () => Object.entries(window.PRODUCT_TYPES || {});
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const dollars = (c) => (c / 100).toFixed(2);
  const toCents = (v) => Math.round(Number(v) * 100);

  const D = window.GS.studioDetails;
  // The Pack Builder (js/studio-packs.js), when it's switched on and loaded.
  const PACKS = () => window.GS.studioPacks && window.GS.studioPacks.enabled();
  function open(root, projectId, onBack) {
    let data = null;
    const base = `/api/studio/projects/${encodeURIComponent(projectId)}/products`;
    const say = (el, text, error = false) => { const m = el && $(".msg", el); if (m) { m.hidden = !text; m.className = `msg${error ? " error" : ""}`; m.textContent = text; } };

    const kindSelect = (cur) => `<select name="type" data-was="${e(cur)}">${KINDS().map(([k, v]) => `<option value="${e(k)}"${k === cur ? " selected" : ""}>${e(v.label)}</option>`).join("")}</select>`;
    const artSelect = (cur) => `<select name="artworkId"><option value="">No cover art</option>${data.images.map((i) => `<option value="${e(i.id)}"${i.src === cur ? " selected" : ""}>${e(i.filename)}</option>`).join("")}</select>`;
    const fields = (p = {}) => `
      <div class="field"><label>Name<input name="title" required minlength="3" maxlength="80" value="${e(p.title || "")}"></label></div>
      <div class="field"><label>Description<textarea name="description" rows="3" maxlength="2000">${e(p.description || "")}</textarea></label></div>
      <div class="studio-two">
        <div class="field"><label>Kind ${kindSelect(p.type || "samples")}</label></div>
        <div class="field"><label>Price in dollars (0 = free)<input name="price" type="number" inputmode="decimal" min="0" max="500" step="0.01" required value="${dollars(p.priceCents ?? 500)}"></label></div>
      </div>
      <div class="field"><label>What's inside (one line each)<textarea name="includes" rows="3">${e((p.includes || []).join("\n"))}</textarea></label></div>
      <div class="field"><label>Tags (up to 8, separated by spaces or commas)<input name="tags" maxlength="220" value="${e((p.tags || []).join(", "))}" placeholder="drums, lo-fi, one-shots"></label></div>
      ${p.id ? `<div class="field"><label>Cover art ${artSelect(p.artwork)}</label><p class="small-print">Upload images in the site editor, then pick one here.</p></div>` : ""}
      ${D ? D.fields(p.type || "samples", p, p.id || "new") : ""}`;

    const card = (p) => `
      <li class="panel studio-product" data-id="${e(p.id)}">
        <div class="studio-block-head"><h3>${e(p.title)}</h3>
          <span class="tag">${p.deleted ? "Removed" : p.published ? (p.salesPaused ? "Paused" : "On sale") : "Draft"}</span></div>
        ${p.deleted ? "" : `<form data-form="edit">${fields(p)}
          <div class="actions"><button class="btn small" type="submit">Save</button>
            ${p.published ? `<button class="btn ghost small" type="button" data-act="${p.salesPaused ? "resume" : "pause"}">${p.salesPaused ? "Resume sales" : "Pause sales"}</button><button class="btn ghost small" type="button" data-act="draft">Back to draft</button>`
              : `<button class="btn small" type="button" data-act="publish">Put on sale</button>`}
            <a class="btn ghost small" href="${e(p.path)}" target="_blank" rel="noopener">View</a>
            <button class="btn ghost small" type="button" data-act="remove">Remove</button></div></form>
          <h4>Files buyers get</h4>
          <ul class="studio-files">${p.files.map((f) => `<li>${e(f.filename)} · ${size(f.sizeBytes)} <span class="tag">${f.status === "pending" ? "Waiting for AutoStacc to check it" : f.status === "published" ? "Ready" : e(f.status)}</span>
            <button class="link-btn" type="button" data-file="${e(f.id)}" aria-label="Remove ${e(f.filename)}">Remove</button></li>`).join("")}${p.packFiles ? `<li>${p.packFiles} file${p.packFiles === 1 ? "" : "s"} from your pack (change them in the Pack Builder)</li>` : ""}${p.files.length || p.packFiles ? "" : "<li>No files yet. A product needs at least one before it can go on sale.</li>"}</ul>
          <label class="btn ghost small studio-upload">Add a file<input type="file" data-upload hidden></label>
          ${PACKS() ? `<button class="btn ghost small" type="button" data-act="packs">Upload a whole pack (ZIP)…</button>` : ""}
          <h4>Preview clip</h4>
          ${p.preview ? `<audio controls preload="none" src="${e(p.preview)}"></audio> <button class="link-btn" type="button" data-act-preview="remove">Remove preview</button>` : '<p class="small-print">A short MP3, M4A, OGG or WAV (under 20 MB) that anyone can play on the product page.</p>'}
          <label class="btn ghost small studio-upload">${p.preview ? "Replace preview" : "Add a preview"}<input type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav" data-upload-preview hidden></label>`}
        <p class="msg" role="status" hidden></p>
      </li>`;

    function draw() {
      root.innerHTML = `
        <div class="studio-bar"><button class="btn ghost" type="button" data-act="back">&larr; All projects</button><h2>Products</h2></div>
        <p class="small-print">${data.limits.used} of ${data.limits.products} products. Prices are free, or $${data.limits.minPriceCents / 100} to $${data.limits.maxPriceCents / 100}. New products start as drafts.${data.trusted ? "" : " Your files are checked by AutoStacc before buyers can get them."}</p>
        <ul class="studio-products">${data.products.map(card).join("") || "<li>No products yet.</li>"}</ul>
        ${data.limits.used < data.limits.products ? `<form class="panel" data-form="new"><h3>New product</h3>${fields()}<button class="btn" type="submit">Create draft</button><p class="msg" role="status" hidden></p></form>` : ""}`;
    }

    async function reload(note) {
      const res = await api(base);
      if (!res.ok) { root.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
      data = res.data;
      draw();
      if (note) say(root, note);
    }

    const read = (f) => ({ title: f.title.value, description: f.description.value, type: f.type.value, priceCents: toCents(f.price.value),
      includes: f.includes.value.split("\n").map((s) => s.trim()).filter(Boolean),
      tags: [...new Set(f.tags.value.toLowerCase().split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))], ...(f.artworkId ? { artworkId: f.artworkId.value || null } : {}),
      ...(D ? D.read(f, f.type.value) : {}) });

    root.onsubmit = async (ev) => {
      const f = ev.target.closest("form[data-form]");
      if (!f) return;
      ev.preventDefault();
      const btn = $("button[type=submit]", f);
      btn.disabled = true;
      const card = f.closest(".studio-product") || f;
      const res = f.dataset.form === "new"
        ? await api(base, { method: "POST", body: read(f) })
        : await api(`/api/studio/products/${encodeURIComponent(card.dataset.id)}`, { method: "PATCH", body: read(f) });
      btn.disabled = false;
      if (!res.ok) return say(card, res.error.message, true);
      await reload();
      const again = card.dataset && card.dataset.id && $(`[data-id="${CSS.escape(card.dataset.id)}"]`, root);
      if (again) say(again, "Saved.");
    };

    const ACTS = { publish: { published: true }, draft: { published: false }, pause: { salesPaused: true }, resume: { salesPaused: false }, remove: { deleted: true } };
    root.onclick = async (ev) => {
      const act = ev.target.closest("[data-act]");
      const card = ev.target.closest(".studio-product");
      if (act && act.dataset.act === "back") return onBack();
      if (act && act.dataset.act === "packs" && card) return window.GS.studioPacks.open(root, card.dataset.id, () => open(root, projectId, onBack));
      if (act && ACTS[act.dataset.act] && card) {
        if (act.dataset.act === "remove" && !confirm("Remove this product? People who bought it keep their files.")) return;
        act.disabled = true;
        const res = await api(`/api/studio/products/${encodeURIComponent(card.dataset.id)}`, { method: "PATCH", body: ACTS[act.dataset.act] });
        if (!res.ok) { act.disabled = false; return say(card, res.error.message, true); }
        return reload();
      }
      if (ev.target.closest("[data-act-preview]") && card) {
        const res = await api(`/api/studio/products/${encodeURIComponent(card.dataset.id)}/preview`, { method: "DELETE" });
        if (!res.ok) return say(card, res.error.message, true);
        return reload();
      }
      const file = ev.target.closest("[data-file]");
      if (file && card) {
        file.disabled = true;
        const res = await api(`/api/studio/products/${encodeURIComponent(card.dataset.id)}/files/${encodeURIComponent(file.dataset.file)}`, { method: "DELETE" });
        if (!res.ok) { file.disabled = false; return say(card, res.error.message, true); }
        reload();
      }
    };

    if (D) D.wire(root);
    root.onchange = async (ev) => {
      // A different kind has different store details: redraw them, keeping what still applies.
      const kind = ev.target.closest("select[name=type]");
      if (kind && D) {
        const f = kind.form, card = f.closest("[data-id]");
        const now = D.read(f, kind.dataset.was || kind.value);
        f.querySelector("[data-details]").outerHTML = D.fields(kind.value, { ...now, suggestions: {} }, card ? card.dataset.id : "new");
        kind.dataset.was = kind.value;
        return;
      }
      const input = ev.target.closest("[data-upload], [data-upload-preview]");
      const card = ev.target.closest(".studio-product");
      if (!input || !card || !input.files[0]) return;
      const file = input.files[0];
      const what = input.hasAttribute("data-upload-preview") ? "preview" : "files";
      say(card, `Uploading ${file.name}…`);
      input.disabled = true;
      try {
        const res = await fetch(`/api/studio/products/${encodeURIComponent(card.dataset.id)}/${what}?filename=${encodeURIComponent(file.name)}`,
          { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" } });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { input.disabled = false; input.value = ""; return say(card, (out.error || {}).message || "Upload failed.", true); }
        await reload();
        say($(`[data-id="${CSS.escape(card.dataset.id)}"]`, root), `Uploaded ${file.name}.`);
      } catch {
        input.disabled = false;
        say(card, "Upload interrupted. Try again.", true);
      }
    };

    reload();
  }

  window.GS.studioProducts = { open };
})();
