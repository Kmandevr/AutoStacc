// Projects page (/projects): lists the projects in data/projects.js and, for signed-in customers, lets them follow a
// project and switch Auto-Stacc on (free releases of that project are added to Your Stacc automatically). Follow
// state comes from the store API; without it the list still shows. Needs data/projects.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const list = $("#projects-list");
  if (!list) return;
  const projects = (window.PROJECTS || []).filter((p) => !p.draft);
  const FEATURES = { releases: "Releases", news: "News", shows: "Shows", store: "Store", polls: "Polls", relationships: "Song connections" };
  let follows = null; // null: not signed in, not confirmed or store offline; else { projectId: { autoStacc } }
  let signedIn = false;

  function controls(p) {
    if (follows === null && signedIn) return `<p class="small-print">Confirm your email (check your inbox) to follow ${e(p.name)} and switch on Auto-Stacc.</p>`;
    if (follows === null) return `<p class="small-print"><a href="/login?next=/projects">Log in</a> to follow ${e(p.name)} and switch on Auto-Stacc.</p>`;
    const f = follows[p.id];
    if (!f) return `<div class="actions"><button class="btn" type="button" data-follow="${e(p.id)}">Follow</button></div>`;
    return `<div class="actions">
      <label class="auto-stacc"><input type="checkbox" data-auto="${e(p.id)}"${f.autoStacc ? " checked" : ""}> Auto-Stacc free releases</label>
      <button class="btn ghost" type="button" data-unfollow="${e(p.id)}">Following ✓ · Unfollow</button></div>`;
  }

  function render(message) {
    list.innerHTML = projects.map((p) => `<li class="project-card" data-project="${e(p.id)}">
      <h3><a href="${e(p.home || "/")}">${e(p.name)}</a></h3>
      <p>${e(p.summary || "")}</p>
      <p class="project-features">${(p.features || []).map((f) => `<span class="tag">${e(FEATURES[f] || f)}</span>`).join(" ")}</p>
      ${controls(p)}
      ${message && message.id === p.id ? `<p class="msg${message.error ? " error" : ""}" role="status">${e(message.text)}</p>` : ""}
    </li>`).join("");
  }

  async function load() {
    const res = await api("/api/projects");
    follows = res.ok && res.data.follows ? Object.fromEntries(res.data.follows.map((f) => [f.projectId, f])) : null;
    signedIn = Boolean(res.ok && res.data.signedIn);
    render();
  }

  async function send(el, id, request, done) {
    el.disabled = true;
    const res = await request();
    el.disabled = false;
    if (!res.ok) return render({ id, error: true, text: res.status === 401 || res.status === 403 ? "Log in with a confirmed email to follow projects." : res.error.message });
    done(res.data);
  }

  const put = (id, autoStacc) => () => api(`/api/follows/${encodeURIComponent(id)}`, { method: "PUT", body: { autoStacc } });

  list.addEventListener("click", (ev) => {
    const follow = ev.target.closest("[data-follow]");
    if (follow && !follow.disabled) send(follow, follow.dataset.follow, put(follow.dataset.follow, false), (d) => { follows[d.follow.projectId] = d.follow; render({ id: d.follow.projectId, text: "Following. New releases show up in Your Stacc." }); });
    const unfollow = ev.target.closest("[data-unfollow]");
    if (unfollow && !unfollow.disabled) send(unfollow, unfollow.dataset.unfollow, () => api(`/api/follows/${encodeURIComponent(unfollow.dataset.unfollow)}`, { method: "DELETE" }),
      () => { delete follows[unfollow.dataset.unfollow]; render({ id: unfollow.dataset.unfollow, text: "Unfollowed. Anything already in Your Stacc stays." }); });
  });

  list.addEventListener("change", (ev) => {
    const box = ev.target.closest("[data-auto]");
    if (!box) return;
    const id = box.dataset.auto;
    send(box, id, put(id, box.checked), (d) => {
      follows[id] = d.follow;
      render({ id, text: d.follow.autoStacc ? `Auto-Stacc on.${d.staccd ? ` ${d.staccd} free item${d.staccd === 1 ? "" : "s"} added to Your Stacc.` : ""}` : "Auto-Stacc off." });
    });
  });

  render();
  load();
})();
