// Follow and Auto-Stacc controls for any project card on any page: fills every [data-follow-slot="<project id>"] (with
// data-name for messages) from the store API (GET /api/projects: who you follow), and handles Follow, Unfollow and the
// Auto-Stacc switch (PUT / DELETE /api/follows/:id). Signed out it offers to log in; with an unconfirmed email it says
// to confirm. Cards drawn later (a filter, a page) fire gs:projects on window and get their controls then.
// Tells other features who is followed, once loaded and after each change, with gs:follows ({ ids }). Needs js/util.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, api, loginPath } = GS;
  let follows = null; // null: not signed in, not confirmed or store offline; else { projectId: { autoStacc } }
  let signedIn = false, loaded = false;
  const slots = () => [...document.querySelectorAll("[data-follow-slot]")];

  function controls(id, name, message) {
    const note = message ? `<p class="msg${message.error ? " error" : ""}" role="status">${e(message.text)}</p>` : "";
    if (!loaded) return "";
    if (follows === null && signedIn) return `<p class="small-print">Confirm your email (check your inbox) to follow ${e(name)}.</p>${note}`;
    if (follows === null) return `<p class="small-print"><a href="${e(loginPath(location.pathname + location.search))}">Log in</a> to follow ${e(name)} and get its free releases automatically.</p>${note}`;
    const f = follows[id];
    if (!f) return `<div class="actions"><button class="btn" type="button" data-follow="${e(id)}">Follow<span class="sr-only"> ${e(name)}</span></button></div>${note}`;
    return `<div class="actions">
      <label class="auto-stacc"><input type="checkbox" data-auto="${e(id)}"${f.autoStacc ? " checked" : ""}> Get its free releases automatically <span class="small-print">(Auto-Stacc)</span></label>
      <button class="btn ghost" type="button" data-unfollow="${e(id)}">Following ✓ · Unfollow<span class="sr-only"> ${e(name)}</span></button></div>${note}`;
  }

  function paint(message) {
    const active = document.activeElement;
    const keep = active && (active.dataset.follow || active.dataset.unfollow || active.dataset.auto);
    for (const el of slots()) {
      const id = el.dataset.followSlot;
      el.innerHTML = controls(id, el.dataset.name || "this project", message && message.id === id ? message : null);
    }
    // After following, focus moves to the new control for the same project, so keyboard users don't lose their place.
    if (keep) {
      const next = document.querySelector(`[data-unfollow="${CSS.escape(keep)}"], [data-follow="${CSS.escape(keep)}"], [data-auto="${CSS.escape(keep)}"]`);
      if (next) next.focus({ preventScroll: true });
    }
  }

  async function load() {
    const res = await api("/api/projects");
    loaded = true;
    follows = res.ok && res.data.follows ? Object.fromEntries(res.data.follows.map((f) => [f.projectId, f])) : null;
    signedIn = Boolean(res.ok && res.data.signedIn);
    paint();
    if (follows) dispatchEvent(new CustomEvent("gs:follows", { detail: { ids: Object.keys(follows) } }));
  }
  const changed = (message) => { paint(message); dispatchEvent(new CustomEvent("gs:follows", { detail: { ids: Object.keys(follows || {}) } })); };

  async function send(el, id, request, done) {
    el.disabled = true;
    const res = await request();
    el.disabled = false;
    if (!res.ok) return paint({ id, error: true, text: res.status === 401 || res.status === 403 ? "Log in with a confirmed email to follow projects." : res.error.message });
    done(res.data);
  }
  const put = (id, autoStacc) => () => api(`/api/follows/${encodeURIComponent(id)}`, { method: "PUT", body: { autoStacc } });

  document.addEventListener("click", (ev) => {
    const follow = ev.target.closest("[data-follow]");
    if (follow && !follow.disabled) {
      const id = follow.dataset.follow;
      send(follow, id, put(id, false), (d) => { follows[d.follow.projectId] = d.follow; changed({ id, text: "Following. Its new releases are listed on your dashboard and in Your Stacc; paid ones still need buying. Switch on Auto-Stacc to add the free ones for you." }); });
    }
    const unfollow = ev.target.closest("[data-unfollow]");
    if (unfollow && !unfollow.disabled) {
      const id = unfollow.dataset.unfollow;
      send(unfollow, id, () => api(`/api/follows/${encodeURIComponent(id)}`, { method: "DELETE" }),
        () => { delete follows[id]; changed({ id, text: "Unfollowed. Anything already in Your Stacc stays." }); });
    }
  });
  document.addEventListener("change", (ev) => {
    const box = ev.target.closest("[data-auto]");
    if (!box) return;
    const id = box.dataset.auto;
    send(box, id, put(id, box.checked), (d) => {
      follows[id] = d.follow;
      changed({ id, text: d.follow.autoStacc ? `Auto-Stacc on.${d.staccd ? ` ${d.staccd} free item${d.staccd === 1 ? "" : "s"} added to Your Stacc.` : ""}` : "Auto-Stacc off." });
    });
  });
  addEventListener("gs:projects", () => paint());

  if (slots().length) load();
  else addEventListener("gs:projects", function once() { removeEventListener("gs:projects", once); load(); });
})();
