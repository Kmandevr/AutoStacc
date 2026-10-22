// The bell (the inbox feature, server/community/features/inbox/; needs js/community-kit.js): a small button at the top
// of the community pages with the number of unread notices; opening it lists them (replies, mentions, best answers,
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
    const main = document.querySelector("main");
    const r = await api("/api/community/inbox");
    if (!main || !r.ok) return;
    let unread = r.data.unread;
    const count = el("span", { class: "cm-bell-count", text: unread ? String(unread) : "" });
    const bell = el("button", { class: "btn ghost small cm-bell", type: "button", "aria-expanded": "false", "aria-label": "Notifications" }, "Notifications ", count);
    const panel = el("div", { class: "cm-inbox", hidden: true });
    r.data.items.forEach((x) => panel.append(el("p", { class: `cm-small${x.read ? "" : " cm-unread"}` },
      `${x.actor || "Someone"} ${WHAT[x.kind] || "wrote in"} `, el("a", { href: x.path, text: x.title }))));
    if (!r.data.items.length) panel.append(el("p", { class: "cm-small", text: "Nothing yet." }));
    bell.addEventListener("click", async () => {
      const open = panel.hidden;
      panel.hidden = !open;
      bell.setAttribute("aria-expanded", String(open));
      if (open && unread) {
        unread = 0;
        count.textContent = "";
        await api("/api/community/inbox/read", { method: "POST", body: { all: true } });
      }
    });
    main.prepend(el("div", { class: "cm-bell-wrap" }, bell, panel));
  })();
})();
