// The old Team desk address in the Studio (/studio?desk=<space id>; owner, 2026-10-22) now sends people to the space's
// own management page (/community/<space>/manage; owner, 2026-10-27), so saved links keep working. Runs before
// js/studio.js and hides the Studio's app while it asks where the space lives. Needs js/util.js.
(function () {
  "use strict";
  const id = new URLSearchParams(location.search).get("desk");
  const root = document.getElementById("studio-app");
  if (!id || !root || !/^[a-z]+_[A-Za-z0-9_-]{1,60}$/.test(id)) return;
  root.removeAttribute("id");
  root.textContent = "Opening the space's management page…";
  window.GS.api(`/api/community/spaces/${encodeURIComponent(id)}/mine`).then((r) => {
    if (r.ok && r.data.path) location.replace(`${r.data.path}/manage`);
    else root.innerHTML = '<p class="msg error">That space wasn\'t found. <a href="/community">Go to the community</a>.</p>';
  });
})();
