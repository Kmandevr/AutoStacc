// The Studio (/studio): claim a creator name, see your creator's address and storage, make, rename and delete
// projects, open your profile or a project's site in the visual builder (js/builder.js; #profile=<creator id> and
// #project=<id> reopen them), a project's products
// (js/studio-products.js; #products=<id>), one product in the Product Studio (js/studio-workspace.js;
// #product=<id>&section=<key>) and see earnings (js/studio-earnings.js). All checks
// (unique names, limits, ownership) happen on the server (server/studio/). Needs js/util.js, js/builder.js (and the
// modules it needs), js/studio-products.js, js/studio-workspace.js and js/studio-earnings.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const root = $("#studio-app");
  if (!root) return;
  const SLUG = "[a-z0-9]+(-[a-z0-9]+)*";
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  const nameFields = (prefix, name = "", slug = "", hint = "") => `
    <div class="field"><label for="${prefix}-name">Name</label><input id="${prefix}-name" name="name" required maxlength="60" value="${e(name)}"></div>
    <div class="field"><label for="${prefix}-slug">Address</label><input id="${prefix}-slug" name="slug" required minlength="3" maxlength="40" pattern="${SLUG}" value="${e(slug)}">
      <p class="small-print">${hint}Lowercase letters, numbers and hyphens. It has to be unique${prefix === "pr" ? " among your projects" : " on AutoStacc"}.</p></div>`;

  function overview(data) {
    root.onclick = root.oninput = root.onchange = null;
    if (!data.creators.length) {
      root.innerHTML = `<div class="studio-start">
        <form class="panel" data-form="creator"><h2>Claim your creator name</h2>
          <p>Your space will live at <strong>${e(location.host)}/<span data-preview>you</span></strong>. Free: no plan, no card.</p>
          ${nameFields("cr")}<button class="btn" type="submit">Claim it</button><p class="msg" role="status" hidden></p></form>
        <ol class="studio-steps" aria-label="How the Studio works">
          <li><strong>Claim your name</strong><span>Your creator address on AutoStacc, unique to you.</span></li>
          <li><strong>Make a project</strong><span>Up to ${data.limits.projectsPerCreator} of them, each with its own page.</span></li>
          <li><strong>Design it visually</strong><span>Start from a template, then drag, drop and style everything on the page itself. No code needed.</span></li>
          <li><strong>Publish</strong><span>Preview privately, then put it live at your address whenever you're ready.</span></li>
        </ol></div>`;
      return;
    }
    root.innerHTML = data.creators.map((c) => `
      <section class="panel wide studio-creator">
        <div class="studio-creator-head">
          <h2>${e(c.name)}</h2>${c.status !== "active" ? ' <strong class="tag">Suspended</strong>' : ""}
          <a class="studio-address" href="${e(c.path)}" target="_blank" rel="noopener">${e(location.host + c.path)}<span class="sr-only"> (opens in a new tab)</span></a>
        </div>
        ${c.trusted ? "" : '<p class="small-print">New creators\' pages are kept out of search engines until AutoStacc has had a look.</p>'}
        <ul class="studio-meters">
          <li><span>Storage</span><strong>${size(c.storage.usedBytes)} <small>of ${size(c.storage.quotaBytes)}</small></strong>
            <meter min="0" max="${c.storage.quotaBytes}" value="${c.storage.usedBytes}" aria-label="Storage used"></meter></li>
          <li><span>Projects</span><strong>${c.projects.length} <small>of ${data.limits.projectsPerCreator}</small></strong>
            <meter min="0" max="${data.limits.projectsPerCreator}" value="${c.projects.length}" aria-label="Projects used"></meter></li>
        </ul>
        <div class="studio-profile"><div><h3 class="studio-sub">Your profile</h3><p class="small-print">Your home at ${e(location.host + c.path)}: who you are, your music, your projects.</p></div>
          <button class="btn small" type="button" data-profile="${e(c.id)}">Design your profile</button></div>
        <h3 class="studio-sub">Projects</h3>
        <ul class="studio-projects">${c.projects.map((p) => `<li class="studio-project">
          <div class="studio-project-head"><strong>${e(p.name)}</strong> <span class="studio-state" data-live="${p.published}">${p.published ? "Live" : "Draft"}</span></div>
          <a class="studio-path" href="${e(p.path)}" target="_blank" rel="noopener">${e(p.path)}<span class="sr-only"> (opens in a new tab)</span></a>
          <div class="studio-project-actions">
            <button class="btn small" type="button" data-edit="${e(p.id)}">Edit site</button>
            <button class="btn ghost small" type="button" data-products="${e(p.id)}">Products</button>
          </div>
          <details><summary>Rename or delete</summary>
            <form data-form="project-edit" data-id="${e(p.id)}">${nameFields(`pe-${e(p.id)}`, p.name, p.slug, "Changing the address keeps the old one redirecting for 90 days. ")}
              <button class="btn ghost small" type="submit">Save</button></form>
            <form class="studio-danger" data-form="project-delete" data-id="${e(p.id)}"><div class="field"><label for="pd-${e(p.id)}">Type ${e(p.slug)} to delete</label><input id="pd-${e(p.id)}" name="confirm" required autocomplete="off"></div>
              <button class="btn ghost small danger" type="submit">Delete project</button></form>
          </details></li>`).join("") || `<li class="studio-empty">No projects yet. Name your first one below: it opens in the editor straight away.</li>`}</ul>
        ${c.projects.length < data.limits.projectsPerCreator ? `<form class="studio-new" data-form="project" data-creator="${e(c.id)}"><h3>New project</h3>${nameFields("pr")}<button class="btn" type="submit">Create project</button></form>` : ""}
        ${c.role === "owner" ? `<details><summary>Rename ${e(c.name)}</summary><form data-form="creator-edit" data-id="${e(c.id)}">
          ${nameFields("ce", c.name, c.slug, "Changing your address keeps the old one redirecting for 90 days. ")}<button class="btn ghost small" type="submit">Save</button></form></details>` : ""}
        ${c.role === "owner" ? `<div class="studio-earnings" data-earnings="${e(c.id)}"></div>` : ""}
        <p class="msg" role="status" hidden></p>
      </section>`).join("");
    root.querySelectorAll("[data-earnings]").forEach((el) => window.GS.studioEarnings.draw(el, el.dataset.earnings));
  }

  async function load() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const ws = window.GS.studioWorkspace;
    if (ws) ws.leave(); // a Product Studio section saves what's pending before another view replaces it
    if (hash.get("product") && ws) return ws.open(root, hash.get("product"), hash.get("section"));
    if (hash.get("project")) return window.GS.builder.open(root, { kind: "project", id: hash.get("project") }, back);
    if (hash.get("profile")) return window.GS.builder.open(root, { kind: "profile", id: hash.get("profile") }, back);
    if (hash.get("products")) return window.GS.studioProducts.open(root, hash.get("products"), back);
    const res = await api("/api/studio");
    if (!res.ok) { root.innerHTML = `<p class="msg error">${e(res.status === 403 ? "Confirm your email first (check your inbox), then come back." : res.error.message)}</p>`; return; }
    overview(res.data);
  }

  function back() {
    history.replaceState(null, "", location.pathname);
    load();
  }

  const SEND = {
    creator: (f) => api("/api/studio/creators", { method: "POST", body: { name: f.name.value, slug: f.slug.value } }),
    "creator-edit": (f) => api(`/api/studio/creators/${encodeURIComponent(f.dataset.id)}`, { method: "PATCH", body: { name: f.name.value, slug: f.slug.value } }),
    project: (f) => api(`/api/studio/creators/${encodeURIComponent(f.dataset.creator)}/projects`, { method: "POST", body: { name: f.name.value, slug: f.slug.value } }),
    "project-edit": (f) => api(`/api/studio/projects/${encodeURIComponent(f.dataset.id)}`, { method: "PATCH", body: { name: f.name.value, slug: f.slug.value } }),
    "project-delete": (f) => api(`/api/studio/projects/${encodeURIComponent(f.dataset.id)}`, { method: "DELETE", body: { confirm: f.confirm.value } })
  };

  root.addEventListener("submit", async (ev) => {
    const f = ev.target.closest("form[data-form]");
    if (!f || !SEND[f.dataset.form]) return;
    ev.preventDefault();
    const btn = $("button[type=submit]", f);
    btn.disabled = true;
    const res = await SEND[f.dataset.form](f);
    btn.disabled = false;
    if (!res.ok) {
      const msg = $(".msg", f.closest(".panel")) || $(".msg", f);
      if (msg) { msg.hidden = false; msg.className = "msg error"; msg.textContent = res.error.message; }
      return;
    }
    if (f.dataset.form === "project") {
      history.replaceState(null, "", `#project=${encodeURIComponent(res.data.project.id)}`);
      return window.GS.builder.open(root, { kind: "project", id: res.data.project.id }, back);
    }
    load();
  });

  // Suggest an address from the name until the address is typed by hand.
  root.addEventListener("input", (ev) => {
    const f = ev.target.form;
    if (!f || !f.slug || !["creator", "project"].includes(f.dataset.form)) return;
    if (ev.target === f.name && !f.slug.dataset.touched) f.slug.value = slugify(f.name.value);
    if (ev.target === f.slug) f.slug.dataset.touched = "1";
    const preview = $("[data-preview]", f);
    if (preview) preview.textContent = f.slug.value || "you";
  });

  root.addEventListener("click", (ev) => {
    const prod = ev.target.closest("[data-products]");
    if (prod) {
      history.replaceState(null, "", `#products=${encodeURIComponent(prod.dataset.products)}`);
      return window.GS.studioProducts.open(root, prod.dataset.products, back);
    }
    const profile = ev.target.closest("[data-profile]");
    if (profile) {
      history.replaceState(null, "", `#profile=${encodeURIComponent(profile.dataset.profile)}`);
      return window.GS.builder.open(root, { kind: "profile", id: profile.dataset.profile }, back);
    }
    const edit = ev.target.closest("[data-edit]");
    if (!edit) return;
    history.replaceState(null, "", `#project=${encodeURIComponent(edit.dataset.edit)}`);
    window.GS.builder.open(root, { kind: "project", id: edit.dataset.edit }, back);
  });

  // Links change the address (a product card's Open, the Product Studio's "Back to project"): draw what it names.
  addEventListener("hashchange", load);
  load();
})();
