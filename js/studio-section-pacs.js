// Product Studio, Pac Builder (GS.studioSections.pacs, drawn by js/studio-workspace.js): the files buyers get. With the
// Pack Builder switched on (data/features.js) the product's Pac through js/studio-packs.js, drawn inside this section
// (its own back bar is hidden by css/studio-sections.css). With the Pac editor on, its one drop zone takes a single file
// too (owner, 2026-10-15: one place to drop anything, and it all opens in the builder), so there's no upload here, only
// the older single files with Remove. Without the editor: PUT /api/studio/products/:id/files?filename= as before (held
// for AutoStacc's approval for a new creator), and Remove (DELETE .../files/:fileId).
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
      const editor = Boolean(packs && window.FEATURES["packs.editor"] && window.GS.pacDrop);
      const older = ((ctx.product.product || {}).files || []).length > 0;
      el.innerHTML = `
        ${packs ? '<div class="spc-pack" data-spc-pack></div>' : ""}
        <section class="spc-files" aria-labelledby="spc-files-h"${editor && !older ? " hidden" : ""}>
          <h3 id="spc-files-h">${editor ? "Older single files" : packs ? "Single files" : "Files buyers get"}</h3>
          ${editor ? '<p class="small-print">Files added before the Pac Builder. New files go in by dropping them in above.</p>' : ""}
          <div data-spc-list></div>
          ${editor ? "" : '<label class="btn ghost small studio-upload">Add a file<input type="file" data-spc-upload hidden></label>'}
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
          ${files.length || p.packFiles ? "" : '<p class="small-print">No files yet. Drop a ZIP, a folder or files above: a product needs at least one before it can go on sale.</p>'}`;
      }
      list();
      const refresh = async (note, error) => { await ctx.reload(); if (!el.isConnected) return; list(); if (note) window.GS.say(filesBox, note, error); };

      if (packs) {
        const box = $("[data-spc-pack]", el);
        window.GS.studioPacks.open(box, id, () => ctx.go("overview"));
        // A published or discarded version changes what buyers get: refresh readiness once the server has answered.
        box.addEventListener("click", (ev) => { if (ev.target.closest("[data-pack-publish], [data-pack-discard]")) setTimeout(() => refresh(), 1500); });
      }

      if (!editor) $("[data-spc-upload]", el).addEventListener("change", async (ev) => {
        const input = ev.target, file = input.files[0];
        if (!file) return;
        input.disabled = true;
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
        if (!rm || !await window.GS.confirm("Remove this file from the product?")) return;
        rm.disabled = true;
        const res = await api(`/api/studio/products/${encodeURIComponent(id)}/files/${encodeURIComponent(rm.dataset.spcRemove)}`, { method: "DELETE" });
        if (!res.ok) { rm.disabled = false; return window.GS.say(filesBox, res.error.message, true); }
        refresh("File removed.");
      });

      return () => { ctx.reload(); };
    }
  };
})();
