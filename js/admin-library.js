// Control Center: the Community library tab (docs/builder.md, phase 8). Every shared piece with its creator, price,
// installs and open reports (most reported first), including pieces their creators deleted; Take down removes it from
// the library, takes its product off sale and stops its images showing on the sites that installed it; Restore puts
// back what it was. Talks to /api/admin/library
// (server/library/admin.js). Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;

  async function draw(panel, message) {
    const res = await api("/api/admin/library");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const rows = res.data.pieces;
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">${rows.length} pieces shared by trusted creators. Reports come from signed-in people; taking a piece down resolves them.</p>
      <div class="admin-table"><table><thead><tr><th>Piece</th><th>Creator</th><th>Price</th><th>Installs</th><th>Reports</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map((p) => `<tr data-id="${e(p.id)}">
        <td><strong>${e(p.title)}</strong><br><span class="small-print">${e(p.kind)}${p.description ? ` · ${e(p.description.slice(0, 120))}` : ""}</span></td>
        <td><a href="${e(p.creator.path)}" target="_blank" rel="noopener">${e(p.creator.name)}</a></td>
        <td>${p.priceCents ? `$${(p.priceCents / 100).toFixed(2)}` : "Free"}</td>
        <td>${p.installs}</td>
        <td>${p.openReports ? `<strong>${p.openReports}</strong><ul class="small-print">${p.reasons.map((r) => `<li>${e(r)}</li>`).join("")}</ul>` : "0"}</td>
        <td>${p.status === "removed" ? `<strong>Taken down</strong>${p.note ? `<br><span class="small-print">${e(p.note)}</span>` : ""}` : p.status === "deleted" ? "Deleted by its creator (still on sites that use it)" : "Listed"}</td>
        <td>${p.status === "removed" ? '<button class="btn ghost small" type="button" data-restore>Restore</button>' : '<button class="btn ghost small danger" type="button" data-takedown>Take down</button>'}</td>
      </tr>`).join("") || '<tr><td colspan="7">Nothing shared yet.</td></tr>'}</tbody></table></div>`;
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-library");
    if (!panel) return;
    draw(panel);
    panel.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-takedown], button[data-restore]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const removing = btn.hasAttribute("data-takedown");
      const note = removing ? prompt("Why? (kept with the piece, for the record)") : "";
      if (removing && note === null) return;
      btn.disabled = true;
      const res = await api(`/api/admin/library/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: removing ? "removed" : "active", ...(note ? { note } : {}) } });
      draw(panel, res.ok ? (removing ? "Taken down." : "Restored.") : res.error.message);
    });
  });
})();
