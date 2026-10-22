// Held posts (core/holds.js; needs js/community-kit.js): on the community pages, the visitor's own posts waiting for a
// space's team (and why); on a space, its team desk lists what is waiting with Approve and Reject (a reason the author
// is told). Does nothing for visitors with nothing waiting and teams with an empty queue.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;

  async function waiting() {
    const r = await api("/api/community/holds/mine");
    if (!r.ok || !r.data.held.length || !kit.notices) return;
    kit.notices.hidden = false;
    kit.notices.append(el("h2", { text: "Waiting for a team" }));
    r.data.held.forEach((x) => kit.notices.append(el("p", { class: "cm-small", text: `In ${x.space}: "${x.title}" (${x.type === "post" ? "your reply" : "your take"}). ${x.reason}` })));
  }

  async function queue() {
    const spaceId = kit.desk.dataset.cmSpace;
    const r = await api(`/api/community/spaces/${enc(spaceId)}/holds`);
    if (!r.ok || !r.data.held.length) return;
    const part = kit.deskPart(`Waiting for approval (${r.data.held.length})`);
    part.open = true;
    r.data.held.forEach((x) => {
      const decide = (outcome, ask) => el("button", { class: "btn ghost small", type: "button", text: outcome === "approve" ? "Approve" : "Reject", on: { click: async (ev) => {
        const reason = ask ? window.prompt(ask) : "";
        if (reason === null) return;
        const b = ev.currentTarget;
        press(b, true);
        const res = await api("/api/community/holds/decide", { method: "POST", body: { targetType: x.type, targetId: x.id, outcome, reason } });
        press(b, false);
        if (res.ok) location.reload(); else window.alert(res.error.message);
      } } });
      part.append(el("article", { class: "cm-desk-item" },
        el("p", { class: "cm-meta", text: `${x.author || "deleted user"} · ${x.title} · ${x.type === "post" ? "reply" : "take"}` }),
        el("blockquote", { text: x.excerpt }),
        el("p", { class: "cm-small", text: x.reason }),
        el("div", { class: "cm-post-tools" }, decide("approve", null), decide("reject", "Why reject it? The author is told."))));
    });
  }

  (async () => {
    const who = await kit.me();
    if (!who.signedIn) return;
    if (kit.notices && who.member) waiting();
    if (kit.desk) { const s = await kit.space(); if (s && s.team) queue(); }
  })();
})();
