// Control Center: Copyright (server/copyright/routes.js). Record a notice that came to the support address (with the
// claimant's statements), then accept it (naming the creator space, the uploading account if known, and what to take
// down: strikes follow), reject it, later withdraw it, or note that the claimant went to court after a counter-notice;
// every waiting notice and the latest decided ones, with strikes, takedowns and counter-notices. Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  const strikeText = (s) => `${s.subject === "creator" ? "space" : "account"} ${s.units === 1 ? "½" : "1"} (${s.state}${s.state === "active" ? `, until ${day(s.expires_at)}` : ""})`;

  function draw(panel, notices, message) {
    panel.innerHTML = `${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">A valid notice gives the uploading account a strike and its creator space half a strike (a whole one if the space's owner uploaded it). Two strikes stop selling; strikes last 12 months. Remove the content itself with the product, file or community tools. <a href="/copyright">Copyright policy</a>.</p>
      <form class="admin-card" data-record>
        <h3>Record a notice from email</h3>
        <label>Claimant's name <input name="claimantName" required maxlength="200"></label>
        <label>Claimant's email <input name="claimantEmail" type="email" required></label>
        <label>Claimant's address <input name="claimantAddress" maxlength="500"></label>
        <label>The work they say is infringed <textarea name="work" required maxlength="4000" rows="2"></textarea></label>
        <label>Where it is on AutoStacc <textarea name="location" required maxlength="4000" rows="2"></textarea></label>
        <label><input type="checkbox" name="statements" required> The notice includes the good-faith and accuracy statements and a signature.</label>
        <button class="btn small" type="submit">Record</button>
      </form>
      <div class="admin-table"><table><thead><tr><th>Received</th><th>Claimant</th><th>Work and where</th><th>Status</th><th>Strikes</th><th></th></tr></thead><tbody>${notices.map((n) => `<tr data-notice="${e(n.id)}">
        <td>${e(day(n.created_at))}<br><span class="small-print">${n.source === "form" ? "form" : "email"}</span></td><td>${e(n.claimant_name)}${n.claimant_role === "agent" ? " (for the owner)" : ""}</td><td>${e(n.work)}<br><span class="small-print">${e(n.location)}</span></td>
        <td>${e(n.status)}${n.creator_name ? `<br><span class="small-print">${e(n.creator_name)}${n.uploader_email ? ` · ${e(n.uploader_email)}` : ""}</span>` : ""}</td>
        <td>${n.strikes.map((s) => e(strikeText(s))).join("<br>")}${n.targets.length ? `<br><span class="small-print">${n.targets.map((t) => e(`${t.kind} ${t.target_id}: ${t.restored_at ? "back" : t.removed_at ? "down" : "not taken down"}`)).join("<br>")}</span>` : ""}${n.counter ? `<br><span class="small-print">counter-notice: ${e(n.counter.status)}${n.counter.status === "waiting" ? `, back on ${e(day(n.counter.restore_after))}` : ""}</span>` : ""}</td>
        <td>${n.status === "received" ? '<button class="btn ghost small" type="button" data-act="accepted">Accept</button> <button class="btn ghost small" type="button" data-act="rejected">Reject</button>'
          : n.status === "accepted" ? `<button class="btn ghost small" type="button" data-act="withdrawn">Withdraw</button>${n.counter && n.counter.status === "waiting" ? ' <button class="btn ghost small" type="button" data-act="sued">Claimant went to court</button>' : ""}` : ""}</td></tr>`).join("") || '<tr><td colspan="6">No notices yet.</td></tr>'}</tbody></table></div>`;
  }

  async function load(panel, message) {
    const res = await api("/api/admin/copyright");
    if (!res.ok) { panel.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    draw(panel, res.data.notices, message);
  }

  async function decide(panel, b) {
    const id = b.closest("[data-notice]").dataset.notice;
    const outcome = b.dataset.act;
    const body = { outcome };
    if (outcome === "accepted") {
      const creatorId = prompt("Creator space id the upload was for (empty if none, e.g. a community post):", "");
      if (creatorId === null) return;
      const uploaderId = prompt("Account id of the uploader, if known (empty if not: then the space gets a whole strike):", "");
      if (uploaderId === null) return;
      const what = prompt("What to take down, as kind:id separated by commas (product_file:pf_…, post:pst_…, thread:thr_…). Empty for nothing:", "");
      if (what === null) return;
      const targets = what.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [kind, id] = x.split(":"); return { kind, id }; });
      Object.assign(body, { creatorId: creatorId.trim() || null, uploaderId: uploaderId.trim() || null, targets });
    } else {
      const note = prompt(outcome === "rejected" ? "Why is it rejected?" : outcome === "sued" ? "What did the claimant send to show they went to court?" : "Why is it withdrawn? (What it took down comes back.)");
      if (!(note && note.trim().length >= 3)) return;
      body.note = note.trim();
    }
    b.disabled = true;
    const res = await api(`/api/admin/copyright/notices/${encodeURIComponent(id)}`, { method: "POST", body });
    if (!res.ok) return load(panel, res.error.message);
    draw(panel, res.data.notices, "Saved.");
  }

  window.addEventListener("gs:admin", () => {
    const panel = $("#admin-copyright");
    if (!panel) return;
    load(panel);
    panel.addEventListener("click", (ev) => { const b = ev.target.closest("[data-act]"); if (b) decide(panel, b); });
    panel.addEventListener("submit", async (ev) => {
      const form = ev.target.closest("[data-record]");
      if (!form) return;
      ev.preventDefault();
      const f = new FormData(form);
      const btn = form.querySelector("button");
      btn.disabled = true;
      const res = await api("/api/admin/copyright/notices", { method: "POST", body: { claimantName: f.get("claimantName"), claimantEmail: f.get("claimantEmail"),
        claimantAddress: f.get("claimantAddress"), work: f.get("work"), location: f.get("location"), statements: f.get("statements") === "on" } });
      btn.disabled = false;
      load(panel, res.ok ? "Recorded." : res.error.message);
    });
  });
})();
