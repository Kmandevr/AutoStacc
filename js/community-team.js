// A space's team on its management page (the spaces feature; owner, 2026-10-27): who runs it (founder, moderators),
// appointing a moderator by username, removing one or stepping down, handing a community over, and archiving or
// reopening it. Only on the full desk (data-cm-desk); the API decides who may do what. Needs js/community-kit.js.
(function () {
  "use strict";
  const GS = window.GS;
  const K = GS && GS.communityKit;
  if (!K || !K.deskFull) return;
  const { el, status, say, busy, action } = K;
  const api = (p) => `/api/community/spaces/${encodeURIComponent(K.desk.dataset.cmSpace)}${p}`;
  const ROLE = { founder: "Founder", moderator: "Moderator" };
  const MANAGED = {
    creator: "The creator's owner and admins manage this space from their Studio team; moderators here only moderate.",
    autostacc: "AutoStacc's admins manage this space; moderators here only moderate."
  };
  const when = (iso) => (GS.fmtDate ? GS.fmtDate(iso) : String(iso).slice(0, 10));

  async function draw(wait) {
    const [r, mine] = await Promise.all([GS.api(api("/team")), K.space()]);
    if (!r.ok || !mine || !mine.team) { if (wait) wait.remove(); return null; }
    const d = r.data;
    const manager = d.you.role === "manager";
    const part = K.deskPart("Team", wait, "team");
    if (MANAGED[d.managedBy]) part.append(el("p", { class: "cm-small", text: MANAGED[d.managedBy] }));
    const msg = status();
    const list = el("ul", { class: "cm-team-list" }, d.team.map((m) => {
      const self = m.userId === d.you.userId;
      const tools = el("span", { class: "cm-team-tools" });
      if (m.role === "moderator" && (manager || self)) {
        tools.append(action(self ? "Step down" : "Remove", { path: api(`/moderators/${encodeURIComponent(m.userId)}`), method: "DELETE",
          done: () => { if (self) location.href = K.desk.dataset.cmPath || "/community"; else redraw(part); } }));
      }
      if (m.role === "moderator" && d.you.founder) {
        const hand = el("button", { class: "btn ghost small", type: "button", text: "Make founder" });
        hand.addEventListener("click", async () => {
          if (!window.confirm(`Hand ${m.name} the founder's role? You'll stay on as a moderator and can't take it back yourself.`)) return;
          K.press(hand, true);
          const x = await GS.api(api("/hand-over"), { method: "POST", body: { userId: m.userId } });
          K.press(hand, false);
          if (x.ok) location.reload(); else say(msg, x.error.message);
        });
        tools.append(hand);
      }
      return el("li", {}, el("strong", { text: m.name }), " ", el("span", { class: "cm-badge", text: ROLE[m.role] || m.role }),
        el("span", { class: "cm-small", text: ` since ${when(m.since)}` }), self ? el("span", { class: "cm-small", text: " (you)" }) : null, tools);
    }));
    if (!d.team.length) list.append(el("li", { class: "cm-small", text: "No moderators yet." }));
    part.append(list);
    if (manager) {
      const name = el("input", { name: "name", required: true, minlength: 3, maxlength: 30, autocomplete: "off", placeholder: "Their username" });
      const form = el("form", { class: "cm-form cm-inline-form", on: { submit: async (ev) => {
        ev.preventDefault();
        busy(form, true);
        const x = await GS.api(api("/moderators"), { method: "POST", body: { name: name.value } });
        busy(form, false);
        if (!x.ok) return say(msg, x.error.message);
        redraw(part, `${x.data.moderator.name} is now a moderator.`);
      } } }, el("label", {}, "Add a moderator", name), el("button", { class: "btn small", type: "submit", text: "Add" }));
      part.append(el("p", { class: "cm-small", text: `Moderators handle reports, approvals, bans and the log. Up to ${d.maxModerators}.` }), form);
    }
    part.append(msg);
    return { part, msg };
  }

  // Drawn again in the old part's place after a change, with a note.
  async function redraw(old, note = "") {
    const w = el("div", { class: "cm-desk-part" });
    old.replaceWith(w);
    const d = await draw(w);
    if (note && d) say(d.msg, note, true);
  }

  // Archiving: the founder's, for a community. Archived spaces stay readable; reopening takes a place under the cap.
  async function archive() {
    const mine = await K.space();
    if (!mine || mine.kind !== "community") return;
    const r = await GS.api(api("/team"));
    if (!r.ok || !r.data.you.founder) return;
    const part = K.deskPart("Archive", null, "archive");
    const archived = mine.state === "archived";
    part.append(el("p", { class: "cm-small", text: archived
      ? "This space is archived: everyone can still read it, and nothing new can be posted. Reopen it to take it back up."
      : "Archiving keeps everything readable and stops new posts and team actions. It frees one of your community places." }));
    const b = el("button", { class: archived ? "btn small" : "btn ghost small cm-danger", type: "button", text: archived ? "Reopen this space" : "Archive this space" });
    const msg = status();
    b.addEventListener("click", async () => {
      if (!archived && !window.confirm("Archive this space? It stays readable, but nobody can post until you reopen it.")) return;
      K.press(b, true);
      const x = await GS.api(api("/archived"), { method: "PUT", body: { archived: !archived } });
      K.press(b, false);
      if (x.ok) location.reload(); else say(msg, x.error.message);
    });
    part.append(b, msg);
  }

  K.me().then((who) => {
    if (!who.signedIn || !(who.features || []).includes("spaces")) return;
    draw(K.deskWait("team"));
    archive();
  });
})();
