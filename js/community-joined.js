// Join a space (the joined feature, server/community/features/joined/; needs js/community-kit.js): a Join button on a
// space's page, and on the front page the takes from your joined spaces move to the top (pages are shared and cached,
// so this happens here, in your browser). Does nothing when the feature is off or the visitor is signed out.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press } = kit;
  const api = window.GS.api;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("joined") || !who.signedIn || !who.member) return;
    const r = await api("/api/community/joined");
    if (!r.ok) return;
    const joined = new Set(r.data.spaceIds);
    const holder = document.querySelector("[data-cm-join]");
    if (holder) {
      const spaceId = holder.dataset.cmJoin;
      const b = el("button", { class: "btn ghost small", type: "button" });
      const draw = () => { b.textContent = joined.has(spaceId) ? "Joined" : "Join this space"; b.setAttribute("aria-pressed", String(joined.has(spaceId))); };
      draw();
      b.addEventListener("click", async () => {
        press(b, true);
        const res = await api(`/api/community/spaces/${encodeURIComponent(spaceId)}/join`, { method: joined.has(spaceId) ? "DELETE" : "PUT" });
        press(b, false);
        if (!res.ok) return window.GS.toast(res.error.message, true);
        if (res.data.joined) joined.add(spaceId); else joined.delete(spaceId);
        draw();
      });
      holder.append(b);
    }
    // The front page: strips from joined spaces first, otherwise in the order they came.
    document.querySelectorAll("ul").forEach((ul) => {
      const strips = [...ul.children].filter((li) => li.classList.contains("cm-strip") && li.dataset.space);
      if (strips.length < 2) return;
      const first = strips.filter((li) => joined.has(li.dataset.space));
      if (!first.length || first.length === strips.length) return;
      first.slice().reverse().forEach((li) => ul.insertBefore(li, ul.querySelector(".cm-strip")));
    });
  })();
})();
