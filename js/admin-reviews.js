// Control Center: Reviews (server/reviews/, server/admin/reviews.js). The latest buyers' reviews with their product,
// rating and text (never who wrote them), and Hide (a note required) or Show again; both audited. Starts on "gs:admin".
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");

  function draw(panel, list, message) {
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">Only people who own a product can review it, and a review shows only while they still do. Hidden reviews stay hidden when edited.</p>
      <div class="admin-table"><table><thead><tr><th>Product</th><th>Stars</th><th>Text</th><th>Date</th><th></th></tr></thead><tbody>${list.map((r) => `<tr>
        <td>${e(r.title)}</td><td>${r.rating}</td><td>${e(r.body)}</td><td>${e(day(r.updatedAt))}</td>
        <td>${r.hiddenAt ? `Hidden (${e(r.hiddenNote || "")}) <button class="btn ghost small" type="button" data-show="${e(r.id)}">Show again</button>`
          : `<button class="btn ghost small danger" type="button" data-hide="${e(r.id)}">Hide</button>`}</td></tr>`).join("") || '<tr><td colspan="5">No reviews yet.</td></tr>'}</tbody></table></div>`;
  }

  async function load(panel, message) {
    const res = await api("/api/admin/reviews");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    draw(panel, res.data.reviews, message);
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-reviews");
    if (!panel) return;
    load(panel);
    panel.addEventListener("click", async (ev) => {
      const hide = ev.target.closest("[data-hide]"), show = ev.target.closest("[data-show]");
      const b = hide || show;
      if (!b) return;
      const note = hide ? prompt("Why is this review hidden? (kept in the audit log)") : "";
      if (hide && !(note && note.trim().length >= 3)) return;
      b.disabled = true;
      const res = await api(`/api/admin/reviews/${encodeURIComponent(b.dataset.hide || b.dataset.show)}/${hide ? "hide" : "show"}`, { method: "POST", body: hide ? { note: note.trim() } : {} });
      if (!res.ok) return load(panel, res.error.message);
      draw(panel, res.data.reviews, "Saved.");
    });
  });
})();
