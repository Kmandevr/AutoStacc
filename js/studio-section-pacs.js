// Product Studio, Pac Builder (GS.studioSections.pacs, drawn by js/studio-workspace.js): the files buyers get. With the
// Pack Builder switched on (data/features.js) the product's Pac through js/studio-packs.js, drawn inside this section
// (its own back bar is hidden by css/studio-sections.css). A single file added here goes into the Pac (owner,
// 2026-10-15): with the Pac editor on, it's checked by the engine like any pack (js/pac-add.js); if this upload started
// the draft it's published at once, and the automated review holds it only if something is flagged; with a draft
// already open it joins that draft. Without the editor: PUT /api/studio/products/:id/files?filename= as before (held
// for AutoStacc's approval for a new creator). Older single files are listed with Remove (DELETE .../files/:fileId).
// Needs js/util.js and js/studio-kit.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const sections = (window.GS.studioSections = window.GS.studioSections || {});
  const STATUS = { pending: "Waiting for AutoStacc to check it", published: "Ready", rejected: "Refused" };

  sections.pacs = {
    draw(el, ctx) {
      const K = window.GS.studioKit;
      const id = (ctx.product.product || {}).id;
      const packs = window.GS.studioPacks && window.GS.studioPacks.enabled();
      const editor = packs && window.FEATURES["packs.editor"] && window.GS.pacAdd;
      el.innerHTML = `
        ${packs ? '<div class="spc-pack" data-spc-pack></div>' : ""}
        <section class="spc-files" aria-labelledby="spc-files-h">
          <h3 id="spc-files-h">${packs ? "Single files" : "Files buyers get"}</h3>
          ${editor ? '<p class="small-print">A file added here goes into your Pac. AutoStacc checks it automatically: a clean file goes live at once, and only a flagged one waits for review.</p>' : ""}
          <div data-spc-list></div>
          <label class="btn ghost small studio-upload">Add a file<input type="file" data-spc-upload hidden></label>
          <p class="msg" role="status"></p>
        </section>`;
      const filesBox = $(".spc-files", el);

      function list() {
        const p = ctx.product.product || {};
        const files = p.files || [];
        $("[data-spc-list]", el).innerHTML = `<ul class="spc-list">${files.map((f) => `<li>
            <span class="spc-name">${e(f.filename)}</span> <span class="small-print">${e(K.size(f.sizeBytes))}</span>
            <span class="tag" data-status="${e(f.status)}">${e(STATUS[f.status] || f.status)}</span>${f.note ? ` <span class="small-print">${e(f.note)}</span>` : ""}
            <button class="link-btn" type="button" data-spc-remove="${e(f.id)}" aria-label="Remove ${e(f.filename)}">Remove</button></li>`).join("")}
          ${p.packFiles ? `<li><span class="spc-name">${Number(p.packFiles)} file${p.packFiles === 1 ? "" : "s"} from your Pac</span></li>` : ""}</ul>
          ${files.length || p.packFiles ? "" : '<p class="small-print">No files yet. A product needs at least one before it can go on sale.</p>'}`;
      }
      list();
      const refresh = async (note, error) => { await ctx.reload(); if (!el.isConnected) return; list(); if (note) window.GS.say(filesBox, note, error); };

      if (packs) {
        const box = $("[data-spc-pack]", el);
        window.GS.studioPacks.open(box, id, () => ctx.go("overview"));
        // A published or discarded version changes what buyers get: refresh readiness once the server has answered.
        box.addEventListener("click", (ev) => { if (ev.target.closest("[data-pack-publish], [data-pack-discard]")) setTimeout(() => refresh(), 1500); });
      }

      // Into the Pac: its open draft, or a new one (copied from the live version) that's then published.
      async function intoPac(file) {
        const B = "/api/studio/packs", P = `${B}/products/${encodeURIComponent(id)}`;
        const say = (t, error) => window.GS.say(filesBox, t, error);
        const info = await api(P);
        if (!info.ok) return say(info.error.message, true);
        let versionId = info.data.pac && info.data.pac.draftVersionId, started = false;
        if (versionId) {
          const v = await api(`${B}/versions/${encodeURIComponent(versionId)}`);
          if (!v.ok || v.data.version.status !== "ready") return say("A version of your Pac is in progress: finish or discard it in the Pac Builder first.", true);
        } else {
          const d = await api(`${P}/drafts`, { method: "POST", body: { idempotencyKey: crypto.randomUUID() } });
          if (!d.ok) return say(d.error.message, true);
          versionId = d.data.version.id;
          started = true;
        }
        const res = await window.GS.pacAdd.add({ base: B, versionId, files: [file], onStatus: (t) => say(`${file.name}: ${t}`) });
        // The Pac Builder above shows the new state too.
        window.GS.studioPacks.open($("[data-spc-pack]", el), id, () => ctx.go("overview"));
        const s = res.addition.stats || {};
        if (!s.files) return say(`${file.name} wasn't added: ${((s.refused || [])[0] || { codes: ["refused"] }).codes.join(", ")}.`, true);
        if (!started) return refresh(`${file.name} is in your Pac's draft. Publish it in the Pac Builder when you're ready.`);
        const pub = await api(`${B}/versions/${encodeURIComponent(versionId)}/publish`, { method: "POST", body: {} });
        if (!pub.ok) return say(pub.error.message, true);
        window.GS.studioPacks.open($("[data-spc-pack]", el), id, () => ctx.go("overview"));
        refresh(pub.status === 202 ? `${file.name} was flagged by the checks and waits for AutoStacc's review.` : `${file.name} is checked and live.`);
      }

      $("[data-spc-upload]", el).addEventListener("change", async (ev) => {
        const input = ev.target, file = input.files[0];
        if (!file) return;
        input.disabled = true;
        if (editor) {
          try { await intoPac(file); } catch (err) { window.GS.say(filesBox, err.message, true); }
          input.disabled = false;
          input.value = "";
          return;
        }
        window.GS.say(filesBox, `Uploading ${file.name}…`);
        try {
          const res = await fetch(`/api/studio/products/${encodeURIComponent(id)}/files?filename=${encodeURIComponent(file.name)}`,
            { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" } });
          const out = await res.json().catch(() => ({}));
          input.disabled = false;
          input.value = "";
          if (!res.ok) return window.GS.say(filesBox, (out.error || {}).message || "That upload didn't work.", true);
          refresh(`Uploaded ${file.name}.`);
        } catch {
          input.disabled = false;
          window.GS.say(filesBox, "Upload interrupted. Try again.", true);
        }
      });

      el.addEventListener("click", async (ev) => {
        const rm = ev.target.closest("[data-spc-remove]");
        if (!rm || !confirm("Remove this file from the product?")) return;
        rm.disabled = true;
        const res = await api(`/api/studio/products/${encodeURIComponent(id)}/files/${encodeURIComponent(rm.dataset.spcRemove)}`, { method: "DELETE" });
        if (!res.ok) { rm.disabled = false; return window.GS.say(filesBox, res.error.message, true); }
        refresh("File removed.");
      });

      return () => { ctx.reload(); };
    }
  };
})();
