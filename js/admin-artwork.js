// Control Center, Products: the one-time move of release artwork that is still a file of the site (HAIL's
// /img/releases/*) into its creator's storage (POST /api/admin/content/artwork/move, server/admin/artwork.js). Shown
// only while some release still waits; the release pages work either way. Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  let box;

  async function draw(note = "") {
    const res = await api("/api/admin/content/artwork");
    const pending = res.ok ? res.data.pending : [];
    box.hidden = !pending.length && !note;
    box.innerHTML = `<h3>Release artwork into storage</h3>
      ${pending.length ? `<p>${pending.length} release${pending.length === 1 ? "" : "s"} still show artwork from the site's own files:</p>
      <ul class="plain">${pending.map((p) => `<li><code>${e(p.src)}</code> (${e(p.releaseId)})</li>`).join("")}</ul>
      <p class="small-print">Moving copies each file into its creator's storage, like any image uploaded in the Studio, and points the release at it. Safe to run again.</p>
      <div class="actions"><button class="btn" type="button" data-artwork-move>Move artwork</button></div>` : ""}
      <p class="msg" role="status">${e(note)}</p>`;
  }

  addEventListener("gs:admin", () => {
    const panel = $("#admin-products");
    if (!panel) return;
    box = document.createElement("div");
    box.className = "panel wide";
    box.hidden = true;
    panel.before(box);
    box.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-artwork-move]");
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      const res = await api("/api/admin/content/artwork/move", { method: "POST", body: {} });
      if (!res.ok) { btn.disabled = false; $("[role=status]", box).textContent = res.error.message; return; }
      const { moved, failed } = res.data;
      draw(`Moved ${moved.length}.${failed.length ? ` Not moved: ${failed.map((f) => `${f.from} (${f.code})`).join(", ")}.` : ""}`);
    });
    draw();
  });
})();
