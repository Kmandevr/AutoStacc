// Product Studio, Store Page (GS.studioSections.store, drawn by js/studio-workspace.js): name, description, "What's
// inside" lines, kind, tags, store details (js/studio-details.js), cover art from the creator's images, the preview clip
// (js/studio-store-media.js), the licence line and the included-content summary, beside a live preview drawn by the
// product page's own template (js/studio-preview.js). Edits autosave (PATCH /api/studio/products/:id, changed fields
// only) about 2 seconds after typing stops; the header shows the save state. Needs js/util.js and js/studio-details.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});
  const WAIT = 2000;

  sections.store = {
    draw(el, ctx) {
      const D = window.GS.studioDetails, P = window.GS.studioPreview;
      const data = ctx.product, p = data.product || {};
      const url = `/api/studio/products/${encodeURIComponent(p.id)}`;
      const kinds = Object.entries(window.PRODUCT_TYPES || {});
      let images = [], timer = null, saving = false, again = false;
      el.innerHTML = `<div class="ss-grid">
        <form class="ss-form" data-ss-form novalidate>
          <div class="field"><label for="ss-title">Name</label><input id="ss-title" name="title" required minlength="3" maxlength="80" value="${e(p.title || "")}"></div>
          <div class="field"><label for="ss-desc">Description</label><textarea id="ss-desc" name="description" rows="5" maxlength="2000">${e(p.description || "")}</textarea></div>
          <div class="field"><label for="ss-inc">What's inside <span class="small-print">(one line each, up to 12)</span></label><textarea id="ss-inc" name="includes" rows="4">${e((p.includes || []).join("\n"))}</textarea></div>
          <div class="studio-two">
            <div class="field"><label for="ss-type">Kind</label><select id="ss-type" name="type" data-was="${e(p.type || "")}">${kinds.map(([k, v]) => `<option value="${e(k)}"${k === p.type ? " selected" : ""}>${e(v.label)}</option>`).join("")}</select></div>
            <div class="field"><label for="ss-tags">Tags <span class="small-print">(up to 8)</span></label><input id="ss-tags" name="tags" maxlength="400" data-tag-input value="${e((p.tags || []).join(", "))}" placeholder="drums, lo-fi, one-shots"></div>
          </div>
          <div class="field"><label for="ss-art">Cover art</label><select id="ss-art" name="artworkId" data-ss-art><option value="">No cover art</option></select>
            <p class="small-print">Upload images in your project's site editor, then pick one here.</p></div>
          ${D ? D.fields(p.type || "other", p, p.id) : ""}
          <p class="msg" data-ss-error role="alert"></p>
        </form>
        <aside class="ss-side">
          <h3>Live preview</h3>
          <div data-ss-preview></div>
          <h3>Preview clip</h3><div data-ss-media></div>
          <h3>Included content</h3>${P ? P.included(p.files, p.packFiles) : ""}
          <h3>Licence</h3><p class="small-print">Buyers get AutoStacc's standard licence for this kind of product. <a href="/license" target="_blank" rel="noopener">Read the licence<span class="sr-only"> (opens in a new tab)</span></a></p>
        </aside></div>`;
      const form = $("[data-ss-form]", el), err = $("[data-ss-error]", el);
      if (D) D.wire(el);
      if (window.GS.studioStoreMedia) window.GS.studioStoreMedia.draw($("[data-ss-media]", el), ctx);

      const lines = (v) => v.split("\n").map((s) => s.trim()).filter(Boolean);
      const words = (v) => [...new Set(v.toLowerCase().split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];
      const read = () => ({ title: form.title.value.trim(), description: form.description.value, includes: lines(form.includes.value), type: form.type.value,
        tags: words(form.tags.value), artworkId: form.artworkId.value || null, ...(D ? D.read(form, form.type.value) : {}) });
      const artworkOf = (v) => (images.find((i) => i.id === v.artworkId) || {}).src || (v.artworkId ? p.artwork : null);
      let saved = read();
      saved.artworkId = undefined; // unknown until the image list arrives: never sent unless the creator picks one

      const preview = () => { if (P) $("[data-ss-preview]", el).innerHTML = P.html(ctx.product, { ...read(), artwork: form.artworkId.value ? artworkOf(read()) : null }); };
      preview();

      // Only what changed is sent, so a field the server refuses doesn't hold back the others next time.
      const changed = () => {
        const now = read(), out = {};
        for (const k of Object.keys(now)) {
          if (k === "artworkId" && saved.artworkId === undefined && !form.artworkId.dataset.touched) continue;
          if (JSON.stringify(now[k]) !== JSON.stringify(saved[k])) out[k] = now[k];
        }
        return out;
      };
      async function save() {
        clearTimeout(timer);
        timer = null;
        if (saving) { again = true; return; }
        const body = changed();
        if (!Object.keys(body).length) { ctx.setSave("saved"); return; }
        saving = true;
        ctx.setSave("saving");
        const res = await api(url, { method: "PATCH", body });
        saving = false;
        if (!res.ok) {
          ctx.setSave("error");
          window.GS.say(form, res.error.message, true);
        } else {
          Object.assign(saved, body);
          err.textContent = "";
          ctx.setSave(again || Object.keys(changed()).length ? "dirty" : "saved");
          ctx.reload();
        }
        if (again) { again = false; save(); }
      }
      const later = () => { ctx.setSave("dirty"); clearTimeout(timer); timer = setTimeout(save, WAIT); preview(); };

      form.addEventListener("input", later);
      form.addEventListener("change", (ev) => {
        const kind = ev.target.closest("select[name=type]");
        if (kind && D) {
          // A different kind has different store details: redraw them, keeping what still applies.
          const now = D.read(form, kind.dataset.was || kind.value);
          $("[data-details]", form).outerHTML = D.fields(kind.value, { ...now, suggestions: {} }, p.id);
          kind.dataset.was = kind.value;
        }
        if (ev.target.matches("[data-ss-art]")) ev.target.dataset.touched = "1";
        later();
      });
      form.addEventListener("submit", (ev) => { ev.preventDefault(); save(); });

      (async () => {
        const res = await api(`/api/studio/projects/${encodeURIComponent((data.project || {}).id || "")}/products`);
        if (!res.ok || !el.isConnected) return;
        images = res.data.images || [];
        const sel = $("[data-ss-art]", el), cur = images.find((i) => i.src === p.artwork);
        sel.insertAdjacentHTML("beforeend", images.map((i) => `<option value="${e(i.id)}"${cur && cur.id === i.id ? " selected" : ""}>${e(i.filename)}</option>`).join(""));
        saved.artworkId = cur ? cur.id : null;
      })();

      // Leaving the section (or the page) saves what's pending straight away.
      const unload = (ev) => { if (timer || saving) { ev.preventDefault(); ev.returnValue = ""; } };
      addEventListener("beforeunload", unload);
      return () => {
        removeEventListener("beforeunload", unload);
        if (timer) save();
      };
    }
  };
})();
