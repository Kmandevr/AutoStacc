// Reopening a space that went read-only by itself (the upkeep feature, server/community/features/upkeep/; needs
// js/community-kit.js): on the space's Team desk, why it's read-only and a Reopen button, which works once no report
// has waited 40 days. Does nothing for anyone but the space's team, or when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit || !kit.desk) return;
  const { el, action } = kit;

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("upkeep") || !who.signedIn) return;
    const s = await kit.space();
    if (!s || !s.team || s.state !== "read_only" || s.stateReason !== "inactive_team") return;
    const part = kit.deskPart("Read-only for now", null, "upkeep");
    part.open = true;
    part.append(el("p", { text: "Nobody on the team acted for 40 days, or reports waited that long, so this space turned read-only by itself. Handle the reports that have waited longest, then reopen it." }),
      action("Reopen the space", { path: `/api/community/spaces/${encodeURIComponent(kit.desk.dataset.cmSpace)}/reopen`, method: "POST", cls: "btn small" }));
  })();
})();
