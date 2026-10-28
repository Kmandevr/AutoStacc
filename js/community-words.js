// Strong words in posts, by the reader's own setting (owner, 2026-10-27, #230; needs js/community-kit.js). The server
// draws a strong word softened (f***) with the word kept in data-w (server/community/core/format.js), the same page
// for everyone; here a signed-in member's choice from Settings applies: "none" shows the words as written, "off" folds
// each post that has one behind "Show post". "restricted" (the default, and everyone signed out) changes nothing.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !document.querySelector(".cm-sw")) return;
  (async () => {
    const who = await kit.me();
    const view = who.member && who.member.wordView;
    if (view === "none") {
      document.querySelectorAll(".cm-sw[data-w]").forEach((w) => { w.textContent = w.dataset.w; w.classList.add("cm-sw-shown"); });
      return;
    }
    if (view !== "off") return;
    const posts = new Set([...document.querySelectorAll(".cm-sw")].map((w) => w.closest("[data-cm-post]")).filter(Boolean));
    posts.forEach((post) => {
      const body = post.querySelector(".cm-body");
      if (!body || body.hidden) return;
      body.hidden = true;
      const show = kit.el("button", { class: "cm-act cm-sw-fold", type: "button", text: "Show post (strong language)", on: { click: () => {
        body.hidden = false;
        show.remove();
      } } });
      body.before(show);
    });
  })();
})();
