// The dashboard (/dashboard), the signed-in workspace: a greeting (and a welcome after confirming an email) in
// [data-dashboard-hello]. Its panels are drop-in modules: Your Stacc at a glance (js/stacc-glance.js), the releases feed
// (js/release-feed.js) and the projects rack (js/projects.js), in tabs; the Community tab lists your notices. The server only serves this page to a signed-in visitor
// (server/pages/guard.js); if the session ends, this script sends the visitor to log in and back. The greeting is
// marked busy (GS.skeleton) until the account answers. Needs js/util.js (js/skeleton.js optional).
(function () {
  "use strict";

  const { $, api, loginPath, skeleton: sk } = window.GS;
  const hello = $("[data-dashboard-hello]");
  if (!hello) return;
  const toLogin = () => location.replace(loginPath(location.pathname + location.search));

  (async () => {
    // The placeholder text stays put (no shift); only the busy mark comes and goes.
    if (sk) hello.setAttribute("aria-busy", "true");
    const me = await api("/api/account");
    if (sk) sk.done(hello);
    if (me.status === 401 || (me.ok && !me.data.user)) return toLogin();
    if (!me.ok) return;
    const welcome = new URLSearchParams(location.search).get("welcome");
    hello.textContent = welcome ? "Email confirmed. Welcome in." : `Welcome back, ${me.data.user.name || "you"}.`;
    // A username picked when creating the account joins the community now that the email is confirmed.
    const joined = await window.GS.pendingUsername.apply();
    if (joined && joined.ok) hello.textContent += ` You're in the community as ${joined.data.member.displayName}.`;
  })();

  // Tabs (owner, 2026-10-22): Overview (Your Stacc, new releases, who you follow, the latest), Discover, Community
  // (your notices) and Account; GS.tabs (js/util.js) wires them. Without this script every panel simply shows.
  const bar = $("[data-home-tabs]");
  const panels = [...document.querySelectorAll("[data-home-panel]")];
  if (bar && window.GS.tabs) {
    const btns = [...bar.querySelectorAll("[data-home-tab]")];
    const show = (i) => panels.forEach((p) => { p.hidden = p.dataset.homePanel !== btns[i].dataset.homeTab; });
    bar.hidden = false;
    window.GS.tabs(btns, show)(0, false);
    notices();
  }

  // The Community tab: your newest notices (the community's inbox), as links. Only text, through textContent.
  async function notices() {
    const box = $("[data-home-notices]");
    if (!box || (window.FEATURES || {})["community.forum"] === false) return;
    const r = await api("/api/community/inbox");
    if (!r.ok || !r.data.items.length) return;
    const WHAT = { reply: "replied to you in", mention: "mentioned you in", answer: "picked your answer in", followed: "posted in" };
    const list = document.createElement("ul");
    list.className = "dash-notices";
    r.data.items.slice(0, 8).forEach((x) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = x.path;
      a.textContent = x.title;
      li.append(`${x.actor || "Someone"} ${WHAT[x.kind] || "wrote in"} `, a);
      if (!x.read) li.className = "is-unread";
      list.append(li);
    });
    box.replaceChildren(list);
  }
})();
