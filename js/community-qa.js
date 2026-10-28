// Questions on a take's page (the qa feature, server/community/features/qa/; needs js/community-kit.js): a Helpful
// button on each answer (not your own) and, for the person who asked or the space's team, "Pick as best answer". A
// newly picked best answer glows softly for a moment (owner: charm; none with reduced motion). Does nothing when the
// feature is switched off or the take isn't a question.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.tools || kit.tools.dataset.cmType !== "question") return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (async () => {
    try {
      const id = sessionStorage.getItem("cm-best-picked");
      sessionStorage.removeItem("cm-best-picked");
      const best = id && document.getElementById(id);
      if (best && !reduce) best.classList.add("cm-glow");
    } catch { /* no glow */ }
    const who = await kit.me();
    if (!who.features.includes("qa") || !who.signedIn || !who.member) return;
    const state = await kit.mine();
    const qa = state && state.features && state.features.qa;
    if (!qa || !qa.question) return;
    const own = new Set(state.ownPosts.map((p) => p.id));
    const threadId = kit.tools.dataset.cmThread;
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      if (post.id === kit.tools.dataset.cmOpening) return;
      const bar = kit.row(post);
      if (!own.has(post.id)) {
        const on = qa.helpful.includes(post.id);
        bar.prepend(kit.action(on ? "Helpful ✓" : "Helpful", { cls: "cm-act", path: `/api/community/posts/${encodeURIComponent(post.id)}/helpful`, method: on ? "DELETE" : "PUT", pressed: on }));
      }
      if (qa.canPick) {
        const best = post.classList.contains("cm-best");
        bar.append(kit.action(best ? "Unpick best answer" : "Best answer", { cls: "cm-act", title: best ? null : "Pick as the best answer",
          path: `/api/community/threads/${encodeURIComponent(threadId)}/accepted`, method: "PUT", body: { postId: best ? null : post.id },
          done: () => { try { if (!best) sessionStorage.setItem("cm-best-picked", post.id); } catch { /* no glow */ } location.reload(); }
        }));
      }
    });
  })();
})();
