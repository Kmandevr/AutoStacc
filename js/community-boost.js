// Boost on a take's page (the boost feature, server/community/features/boost/; needs js/community-kit.js): turns the
// server-drawn level meter into a button. Pressing it boosts the take (or takes the boost back); the meter jumps with a
// quick bounce and settles (owner: charm; none with reduced motion). Does nothing when the feature is switched off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  const box = document.querySelector("[data-cm-boost]");
  if (!kit || !box) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LEVELS = 6;
  const level = (n) => Math.min(LEVELS, n <= 0 ? 0 : Math.ceil(Math.log2(n + 1)));
  (async () => {
    const who = await kit.me();
    if (!who.features.includes("boost") || !who.signedIn || !who.member) return;
    const state = await kit.mine();
    const mine = state && state.features && state.features.boost;
    if (!mine || mine.own) return;
    let on = mine.boosted;
    const b = kit.el("button", { class: "cm-boost-btn", type: "button", "aria-pressed": String(on), title: "Boost (upvote)" });
    const draw = (count) => {
      box.querySelectorAll(".cm-meter i").forEach((i, k) => i.classList.toggle("on", k < level(count)));
      box.querySelector(".cm-count").textContent = count;
      b.textContent = on ? "Boosted" : "Boost";
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", on ? `Boosted. ${count} boosts. Press to take your boost back.` : `Boost this take. ${count} boosts.`);
    };
    b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await window.GS.api(`/api/community/threads/${encodeURIComponent(box.dataset.cmBoost)}/boost`, { method: on ? "DELETE" : "PUT" });
      b.disabled = false;
      if (!r.ok) return window.alert(r.error.message);
      on = r.data.boosted;
      draw(r.data.count);
      if (on && !reduce) { box.classList.remove("cm-bounce"); void box.offsetWidth; box.classList.add("cm-bounce"); }
    });
    box.append(b);
    draw(Number(box.dataset.count) || 0);
  })();
})();
