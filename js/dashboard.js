// The dashboard (/dashboard), the signed-in workspace: a greeting (and a welcome after confirming an email) in
// [data-dashboard-hello]. Its panels are drop-in modules: Your Stacc at a glance (js/stacc-glance.js), the releases feed
// (js/release-feed.js) and the projects rack (js/projects.js). The server only serves this page to a signed-in visitor
// (server/pages/guard.js); if the session ends, this script sends the visitor to log in and back. Needs js/util.js.
(function () {
  "use strict";

  const { $, api, loginPath } = window.GS;
  const hello = $("[data-dashboard-hello]");
  if (!hello) return;
  const toLogin = () => location.replace(loginPath(location.pathname + location.search));

  (async () => {
    const me = await api("/api/account");
    if (me.status === 401 || (me.ok && !me.data.user)) return toLogin();
    if (!me.ok) return;
    const welcome = new URLSearchParams(location.search).get("welcome");
    hello.textContent = welcome ? "Email confirmed. Welcome in." : `Welcome back, ${me.data.user.name || "you"}.`;
  })();
})();
