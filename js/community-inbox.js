// The bell (the inbox feature, server/community/features/inbox/; needs js/community-kit.js): the Notifications panel in
// the community toolbar (owner, 2026-10-27), with the number of unread notices; opening it lists them (replies, mentions, best answers,
// followed takes) and marks them seen. Text only through textContent. Does nothing when the feature is off or the
// visitor is signed out.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el } = kit;
  const api = window.GS.api;
  const WHAT = { reply: "replied to you in", mention: "mentioned you in", answer: "picked your answer in", followed: "posted in" };

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("inbox") || !who.signedIn || !who.member) return;
    const r = await api("/api/community/inbox");
    const slot = r.ok && kit.panel("inbox", "Notifications");
    if (!slot) return;
    let unread = r.data.unread;
    const count = el("span", { class: "cm-bell-count", text: unread ? String(unread) : "" });
    slot.button.replaceChildren("Notifications", count);
    slot.button.setAttribute("aria-label", unread ? `Notifications: ${unread} unread` : "Notifications");
    const list = el("div", { class: "cm-inbox" });
    r.data.items.forEach((x) => list.append(el("p", { class: `cm-small${x.read ? "" : " cm-unread"}` },
      `${x.actor || "Someone"} ${WHAT[x.kind] || "wrote in"} `, el("a", { href: x.path, text: x.title }))));
    if (!r.data.items.length) list.append(el("p", { class: "cm-small", text: "Nothing yet. Replies to you, mentions and best answers land here." }));
    slot.box.prepend(list);
    slot.box.addEventListener("gs:cm-open", async () => {
      if (!unread) return;
      unread = 0;
      count.textContent = "";
      slot.button.setAttribute("aria-label", "Notifications");
      await api("/api/community/inbox/read", { method: "POST", body: { all: true } });
    });
  })();
})();
