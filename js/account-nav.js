// Account navigation on every page: asks the store once whether the visitor is signed in (GET /api/account), shows the
// matching set of [data-auth="in"] / [data-auth="out"] elements (the frames' links, the home page's actions) and
// handles every [data-signout] button. It only chooses which links to show: the account pages are gated on the server
// (server/pages/guard.js) and every private API checks the session itself. A remembered hint ("this browser was
// signed in", never who) picks the set before the answer arrives; offline or with the store down the set stays as
// it is. Load it after the frame (js/layout.js or js/project-frame.js). Needs js/util.js.
(function () {
  "use strict";

  const { api } = window.GS;
  const KEY = "gs:in";
  const remember = (on) => {
    try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  };
  const recalled = () => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  };

  function show(signedIn) {
    document.querySelectorAll("[data-auth]").forEach((el) => { el.hidden = (el.dataset.auth === "in") !== signedIn; });
  }

  show(recalled());
  api("/api/account").then((res) => {
    if (!res.ok) return;
    const signedIn = Boolean(res.data.user);
    remember(signedIn);
    show(signedIn);
  });

  // Log out from anywhere, then land on the public home page. If the store didn't confirm it, say so and stay: a
  // visitor on a shared computer must not walk away still signed in.
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-signout]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const res = await api("/api/auth/sign-out", { method: "POST", body: {} });
    if (!res.ok && res.status !== 401) {
      btn.disabled = false;
      btn.textContent = "Log out failed, try again";
      return;
    }
    remember(false);
    location.replace("/");
  });
})();
