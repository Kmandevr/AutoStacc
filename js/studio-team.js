// The Studio's Team panel and invitations (GS.studioTeam, for js/studio.js; docs/builder.md, phase 7). draw(el,
// creatorId): the members and their roles; owners and admins invite by email, change roles and remove people, and
// anyone but the owner can leave. invite(root, token, onDone): what an emailed invitation is for, and Accept. The
// server decides who may do what (server/creators/roles.js) and answers with a message when not. Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const ABOUT = {
    admin: "Everything except money and deleting the creator",
    publisher: "Edits and publishes the profile and sites",
    store_manager: "Runs products and their files, never money",
    editor: "Edits drafts; someone else publishes"
  };

  async function draw(el, creatorId) {
    const base = `/api/studio/creators/${encodeURIComponent(creatorId)}`;
    const res = await api(`${base}/team`);
    if (!res.ok) { el.innerHTML = ""; return; }
    const t = res.data;
    const manages = t.you.capabilities.includes("members");
    const grantable = t.roles.filter((r) => r.youMayGrant);
    const options = (current) => grantable.map((r) => `<option value="${e(r.id)}"${r.id === current ? " selected" : ""}>${e(r.label)}</option>`).join("");
    const mayChange = (m) => manages && m.role !== "owner" && grantable.some((r) => r.id === m.role);
    el.innerHTML = `<h3 class="studio-sub">Team</h3>
      <ul class="studio-team">${t.members.map((m) => `<li><span><strong>${e(m.name || "Member")}</strong>${m.you ? " (you)" : ""}${m.email ? `<small>${e(m.email)}</small>` : ""}</span>
        ${mayChange(m) ? `<label><span class="sr-only">Role of ${e(m.name)}</span><select data-team-role="${e(m.userId)}">${options(m.role)}</select></label>
          <button class="btn ghost small danger" type="button" data-team-remove="${e(m.userId)}">Remove</button>`
          : `<span class="tag">${e(m.label)}</span>${m.you && m.role !== "owner" ? '<button class="btn ghost small" type="button" data-team-leave>Leave</button>' : ""}`}</li>`).join("")}
        ${t.invites.map((i) => `<li class="studio-team-invite"><span><strong>${e(i.email)}</strong><small>Invited as ${e(i.label)} · until ${e(new Date(i.expiresAt).toLocaleDateString())}</small></span>
          <button class="btn ghost small" type="button" data-team-withdraw="${e(i.id)}">Withdraw</button></li>`).join("")}</ul>
      ${manages ? `<form class="studio-team-new" data-team-invite><div class="field"><label for="ti-${e(creatorId)}">Invite by email</label><input id="ti-${e(creatorId)}" name="email" type="email" required maxlength="254" autocomplete="off"></div>
        <div class="field"><label for="tr-${e(creatorId)}">Role</label><select id="tr-${e(creatorId)}" name="role">${options("editor")}</select></div>
        <button class="btn small" type="submit">Send invitation</button>
        <p class="small-print">${grantable.map((r) => `<strong>${e(r.label)}:</strong> ${e(ABOUT[r.id] || "")}.`).join(" ")} Only the owner sees money.</p></form>` : ""}
      <p class="msg" role="status" hidden></p>`;
    const say = (text, error) => { const m = $(".msg", el); m.hidden = false; m.className = `msg${error ? " error" : ""}`; m.textContent = text; };
    const after = async (res2, done) => { if (!res2.ok) return say(res2.error.message, true); await draw(el, creatorId); say(done); };

    el.onsubmit = async (ev) => {
      const f = ev.target.closest("[data-team-invite]");
      if (!f) return;
      ev.preventDefault();
      const btn = $("button[type=submit]", f);
      btn.disabled = true;
      const r = await api(`${base}/invites`, { method: "POST", body: { email: f.email.value, role: f.role.value } });
      btn.disabled = false;
      after(r, `Invitation sent to ${f.email.value}.`);
    };
    el.onchange = async (ev) => {
      const s = ev.target.closest("[data-team-role]");
      if (s) after(await api(`${base}/members/${encodeURIComponent(s.dataset.teamRole)}`, { method: "PATCH", body: { role: s.value } }), "Role changed.");
    };
    el.onclick = async (ev) => {
      const b = ev.target.closest("button[data-team-remove], button[data-team-withdraw], button[data-team-leave]");
      if (!b) return;
      b.disabled = true;
      if (b.dataset.teamRemove && confirm("Remove this person from the team?")) return after(await api(`${base}/members/${encodeURIComponent(b.dataset.teamRemove)}`, { method: "DELETE", body: {} }), "Removed.");
      if (b.dataset.teamWithdraw) return after(await api(`${base}/invites/${encodeURIComponent(b.dataset.teamWithdraw)}`, { method: "DELETE", body: {} }), "Invitation withdrawn.");
      if (b.hasAttribute("data-team-leave") && confirm("Leave this team? You'll need a new invitation to come back.")) {
        const me = t.members.find((m) => m.you);
        const r = await api(`${base}/members/${encodeURIComponent(me.userId)}`, { method: "DELETE", body: {} });
        if (r.ok) { location.hash = ""; location.reload(); return; }
        return say(r.error.message, true);
      }
      b.disabled = false;
    };
  }

  async function invite(root, token, onDone) {
    root.innerHTML = '<p class="msg pending">Opening the invitation…</p>';
    const res = await api(`/api/studio/invites/${encodeURIComponent(token)}`);
    if (!res.ok) { root.innerHTML = `<div class="panel"><h2>Invitation</h2><p class="msg error">${e(res.error.message)}</p><button class="btn ghost" type="button" data-done>To the Studio</button></div>`; root.querySelector("[data-done]").onclick = onDone; return; }
    const i = res.data;
    root.innerHTML = `<div class="panel"><h2>Join ${e(i.creator.name)}</h2>
      <p>You're invited to join <a href="${e(i.creator.path)}" target="_blank" rel="noopener">${e(i.creator.name)}</a> as <strong>${e(i.label)}</strong>: ${e(ABOUT[i.role] || "")}.</p>
      ${i.forYou ? '<button class="btn" type="button" data-accept>Accept</button>' : "<p class=\"msg error\">This invitation was sent to another email address. Sign in with the account for that address to accept it.</p>"}
      <button class="btn ghost" type="button" data-done>Not now</button><p class="msg" role="status" hidden></p></div>`;
    root.querySelector("[data-done]").onclick = onDone;
    const btn = root.querySelector("[data-accept]");
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      const r = await api(`/api/studio/invites/${encodeURIComponent(token)}/accept`, { method: "POST", body: {} });
      if (r.ok) return onDone();
      btn.disabled = false;
      const m = root.querySelector(".msg[role=status]");
      m.hidden = false;
      m.className = "msg error";
      m.textContent = r.error.message;
    };
  }

  window.GS.studioTeam = { draw, invite };
})();
