// Product Studio, Store Page's preview clip (GS.studioStoreMedia, for js/studio-section-store.js): play, add, replace or
// remove the short clip anyone can play on the product page (PUT /api/studio/products/:id/preview?filename= with the raw
// file, DELETE the same address). The server checks type and size. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;

  function draw(box, ctx) {
    const p = ctx.product.product || {};
    const url = `/api/studio/products/${encodeURIComponent(p.id)}/preview`;
    box.innerHTML = `${p.preview ? `<audio controls preload="none" src="${e(p.preview)}"></audio>` : '<p class="small-print">A short MP3, M4A, OGG or WAV (under 20 MB) that anyone can play on the product page.</p>'}
      <div class="ss-media-actions">
        <label class="btn ghost small studio-upload">${p.preview ? "Replace the clip" : "Add a clip"}<input type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav" data-ss-clip hidden></label>
        ${p.preview ? '<button class="btn ghost small danger" type="button" data-ss-clip-remove>Remove the clip</button>' : ""}
      </div><p class="msg" role="status"></p>`;
    const done = async (note) => { await ctx.reload(); draw(box, ctx); if (note) window.GS.say(box, note); };

    $("[data-ss-clip]", box).addEventListener("change", async (ev) => {
      const input = ev.target, file = input.files[0];
      if (!file) return;
      input.disabled = true;
      window.GS.say(box, `Uploading ${file.name}…`);
      try {
        const res = await fetch(`${url}?filename=${encodeURIComponent(file.name)}`, { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" } });
        const out = await res.json().catch(() => ({}));
        input.disabled = false;
        input.value = "";
        if (!res.ok) return window.GS.say(box, (out.error || {}).message || "That upload didn't work.", true);
        done(`Uploaded ${file.name}.`);
      } catch {
        input.disabled = false;
        window.GS.say(box, "Upload interrupted. Try again.", true);
      }
    });
    const rm = $("[data-ss-clip-remove]", box);
    if (rm) rm.addEventListener("click", async () => {
      rm.disabled = true;
      const res = await api(url, { method: "DELETE" });
      if (!res.ok) { rm.disabled = false; return window.GS.say(box, res.error.message, true); }
      done("Clip removed.");
    });
  }

  window.GS.studioStoreMedia = { draw };
})();
