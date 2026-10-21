// Blocking (the blocks feature, server/community/features/blocks/; needs js/community-kit.js): posts by people you've
// blocked fold away on every community page (pages are shared, so it happens here), with a way to show one; Block
// and Unblock on other people's posts. The server stops a blocked person replying to you. Does nothing when the
// feature is off or you're signed out.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press } = kit;
  const api = window.GS.api;

  const nameOf = (post) => {
    const n = post.querySelector(".cm-meta .cm-name");
    return n ? n.textContent : null;
  };

  function fold(post) {
    const body = post.querySelector(".cm-body");
    if (!body || post.querySelector(".cm-folded")) return;
    body.hidden = true;
    const show = el("button", { class: "btn ghost small", type: "button", text: "Show anyway", on: { click: () => { body.hidden = false; note.remove(); } } });
    const note = el("p", { class: "cm-folded cm-small" }, "You blocked this person. ", show);
    body.before(note);
  }

  const toggle = (name, blocked) => el("button", { class: "btn ghost small", type: "button", text: blocked ? "Unblock" : "Block", on: { click: async (ev) => {
    if (!blocked && !window.confirm(`Block ${name}? Their posts fold away for you, and they can't reply under your posts. They aren't notified.`)) return;
    const b = ev.currentTarget;
    press(b, true);
    const r = await api("/api/community/blocks", { method: blocked ? "DELETE" : "PUT", body: { name } });
    press(b, false);
    if (r.ok) location.reload(); else window.alert(r.error.message);
  } } });

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("blocks") || !who.signedIn || !who.member) return;
    const r = await api("/api/community/blocks");
    if (!r.ok) return;
    const names = new Set(r.data.names);
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      const name = nameOf(post);
      if (!name || name === who.member.displayName) return;
      if (names.has(name)) fold(post);
      const tools = post.querySelector("[data-cm-tools]") || post.appendChild(el("div", { class: "cm-post-tools", "data-cm-tools": post.id }));
      tools.append(toggle(name, names.has(name)));
    });
  })();
})();
