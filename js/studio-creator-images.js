// A creator's avatar and banner in the Studio (GS.studioCreatorImages, drawn by js/studio.js; owner, 2026-10-22, #211):
// upload an image (it joins the creator's site files and storage) and it becomes the avatar or banner on the creator's
// card in Discover; Remove clears it. The server checks the image is the creator's own. Needs js/util.js.
(function () {
  "use strict";
  const { escapeHTML: e, api } = window.GS;

  window.GS.studioCreatorImages = {
    draw(el) {
      const id = el.dataset.creatorImages;
      const row = (field, label, src) => `<div class="studio-creator-image" data-field="${field}">
          <span class="small-print"><strong>${label}</strong></span>
          ${src ? `<img src="${e(src)}" alt="" width="64" height="64" loading="lazy">` : '<span class="small-print">None yet</span>'}
          <label class="btn ghost small">Upload<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
          ${src ? '<button class="btn ghost small" type="button" data-clear>Remove</button>' : ""}</div>`;
      const paint = (avatar, banner) => {
        el.innerHTML = `${row("avatarId", "Avatar", avatar)}${row("bannerId", "Banner", banner)}
          <p class="small-print">Shown on your card in Discover. PNG, JPEG or WebP; they count toward your storage.</p><p class="msg" role="status" hidden></p>`;
      };
      const msg = (text, ok) => { const m = el.querySelector(".msg"); m.hidden = false; m.className = ok ? "msg" : "msg error"; m.textContent = text; };
      const save = async (field, value) => {
        const r = await api(`/api/studio/creators/${encodeURIComponent(id)}`, { method: "PATCH", body: { [field]: value } });
        if (!r.ok) return msg(r.error.message, false);
        el.dataset[field === "avatarId" ? "avatar" : "banner"] = value ? `/media/sites/${value}` : "";
        paint(el.dataset.avatar, el.dataset.banner);
        msg("Saved.", true);
      };
      el.addEventListener("change", async (ev) => {
        const input = ev.target.closest("input[type=file]");
        const file = input && input.files[0];
        if (!file) return;
        const field = input.closest("[data-field]").dataset.field;
        input.disabled = true;
        // Raw bytes, like the builder's uploads (GS.api sends JSON).
        const res = await fetch(`/api/studio/creators/${encodeURIComponent(id)}/images?filename=${encodeURIComponent(file.name)}`,
          { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" } }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        input.disabled = false;
        if (!res || !res.ok) return msg((body.error && body.error.message) || "The upload didn't work. Try again.", false);
        save(field, body.image.id);
      });
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-clear]");
        if (b) { b.disabled = true; save(b.closest("[data-field]").dataset.field, ""); }
      });
      paint(el.dataset.avatar, el.dataset.banner);
    }
  };
})();
