// Control Center: Community (the legal feature, server/community/features/legal/). The reports routed to AutoStacc,
// oldest first, with what was reported, who reported it and why, and Remove (a legal removal, optionally suspending
// the author), Dismiss or Under 16; then who is suspended from the community, with Lift. Every decision is audited.
// Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const REASON = { illegal: "Illegal content", copyright: "Copyright", impersonation: "Impersonation", underage: "Under 16" };

  function draw(panel, reports, suspensions, message) {
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">Only what the law puts on AutoStacc comes here: illegal content, copyright, impersonation and under-16 accounts. Space teams handle everything else. Formal copyright notices follow the <a href="/copyright">copyright policy</a>.</p>
      <h3>Reports</h3>
      ${reports.map((r) => `<article class="admin-card" data-target="${e(r.type)}:${e(r.id)}">
        <p><strong>${e(r.title)}</strong> · ${e(r.space)} · ${e(r.author || "deleted user")} · ${e(r.type === "thread" ? "take" : "reply")}${r.state !== "visible" ? ` · ${e(r.state)}${r.removedReason ? ` (${e(r.removedReason)})` : ""}` : ""}
          · <a href="/community/t/${encodeURIComponent(r.threadId)}${r.type === "post" ? "#" + encodeURIComponent(r.id) : ""}">open</a></p>
        <blockquote>${e(r.text)}</blockquote>
        <ul>${r.reports.map((x) => `<li>${e(REASON[x.reason] || x.reason)}: ${e(x.note)} <span class="small-print">(${e(x.reporter)}, ${e(day(x.at))})</span></li>`).join("")}</ul>
        <p><button class="btn small danger" type="button" data-act="removed">Remove</button>
          <button class="btn ghost small" type="button" data-act="dismissed">Dismiss</button>
          ${r.authorKnown ? '<button class="btn ghost small" type="button" data-act="underage">Under 16</button>' : ""}</p>
      </article>`).join("") || "<p>No reports waiting.</p>"}
      <h3>Suspended from the community</h3>
      <div class="admin-table"><table><thead><tr><th>Name</th><th>Why</th><th>Until</th><th></th></tr></thead><tbody>${suspensions.map((s) => `<tr>
        <td>${e(s.name || "no username")}</td><td>${e(s.reason)}</td><td>${e(s.until ? day(s.until) : "until lifted")}</td>
        <td><button class="btn ghost small" type="button" data-lift="${e(s.userId)}">Lift</button></td></tr>`).join("") || '<tr><td colspan="4">Nobody.</td></tr>'}</tbody></table></div>`;
  }

  async function load(panel, message) {
    const [r, s] = await Promise.all([api("/api/admin/community/reports"), api("/api/admin/community/suspensions")]);
    if (!r.ok || !s.ok) { panel.innerHTML = `<p class="msg error">${e((r.ok ? s : r).error.message)}</p>`; return; }
    draw(panel, r.data.reports, s.data.suspensions, message);
  }

  async function decide(panel, b) {
    const [type, id] = b.closest("[data-target]").dataset.target.split(":");
    const outcome = b.dataset.act;
    let reason = "";
    let suspendDays;
    if (outcome !== "dismissed") {
      reason = prompt(outcome === "underage" ? "Note for the audit log (their community activity is removed):" : "Why is it removed? The author and the space's team see this, so don't name who sent the notice. It's kept in the audit log.");
      if (!(reason && reason.trim().length >= 3)) return;
      if (outcome === "removed") {
        const days = prompt("Also suspend the author from the community? Days, or 0 for until lifted. Leave empty for no suspension.", "");
        if (days === null) return;
        if (days.trim() && !/^\d+$/.test(days.trim())) return load(panel, "Days must be a whole number (0 for until lifted).");
        if (days.trim()) suspendDays = Number(days) === 0 ? null : Number(days);
      }
    }
    b.disabled = true;
    const res = await api("/api/admin/community/reports/resolve", { method: "POST", body: { targetType: type, targetId: id, outcome, reason: reason.trim(), suspendDays } });
    load(panel, res.ok ? "Saved." : res.error.message);
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-community");
    if (!panel) return;
    load(panel);
    panel.addEventListener("click", async (ev) => {
      const act = ev.target.closest("[data-act]"), lift = ev.target.closest("[data-lift]");
      if (act) return decide(panel, act);
      if (!lift || !await window.GS.confirm("Lift this suspension?")) return;
      lift.disabled = true;
      const res = await api(`/api/admin/community/suspensions/${encodeURIComponent(lift.dataset.lift)}`, { method: "DELETE" });
      load(panel, res.ok ? "Lifted." : res.error.message);
    });
  });
})();
