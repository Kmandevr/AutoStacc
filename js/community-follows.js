// Follow a take (the follows feature, server/community/features/follows/; needs js/community-kit.js): a Follow /
// Following button in the take's team-and-author tools. Following means replies show in your inbox. Does nothing when
// the feature is off or the visitor can't post here.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.tools) return;
  const { el, press } = kit;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("follows") || !who.signedIn || !who.member) return;
    const state = await kit.mine();
    if (!state || !state.features || !state.features.follows) return;
    let following = state.features.follows.following;
    const path = `/api/community/threads/${encodeURIComponent(kit.tools.dataset.cmThread)}/follow`;
    const b = el("button", { class: "btn ghost small", type: "button", "aria-pressed": String(following) });
    const draw = () => { b.textContent = following ? "Following" : "Follow"; b.setAttribute("aria-pressed", String(following)); };
    draw();
    b.addEventListener("click", async () => {
      press(b, true);
      const r = await window.GS.api(path, { method: following ? "DELETE" : "PUT" });
      press(b, false);
      if (r.ok) { following = r.data.following; draw(); } else window.GS.toast(r.error.message, true);
    });
    kit.tools.hidden = false;
    kit.tools.append(b);
  })();
})();
