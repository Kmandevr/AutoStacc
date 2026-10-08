// The Studio (/studio): claim a creator name, see your creator's address and free storage, make, rename and delete
// projects, and open a project's site in the editor (js/studio-editor.js; #project=<id> reopens it). All checks
// (unique names, limits, ownership) happen on the server (server/studio/). Needs js/util.js, js/studio-blocks.js and
// js/studio-editor.js.
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
      root.innerHTML = `<form class="panel" data-form="creator"><h2>Claim your creator name</h2>
        <p>Your space will live at <strong>${e(location.host)}/<span data-preview>you</span></strong>. Free: no plan, no card.</p>
        ${nameFields("cr")}<button class="btn" type="submit">Claim it</button><p class="msg" role="status" hidden></p></form>`;
      return;
    }
    root.innerHTML = data.creators.map((c) => `
      <section class="panel wide studio-creator">
        <h2>${e(c.name)}</h2>
        <p>Your address: <a href="${e(c.path)}" target="_blank" rel="noopener">${e(location.host + c.path)}</a>${c.status !== "active" ? ' <strong class="tag">Suspended</strong>' : ""}
          ${c.trusted ? "" : '<br><span class="small-print">New creators\' pages are kept out of search engines until AutoStacc has had a look.</span>'}</p>
        <p class="small-print">Storage: ${size(c.storage.usedBytes)} of ${size(c.storage.quotaBytes)} free · ${c.projects.length} of ${data.limits.projectsPerCreator} projects</p>
        <ul class="studio-projects">${c.projects.map((p) => `<li>
          <strong>${e(p.name)}</strong> <span class="tag">${p.published ? "Live" : "Draft"}</span>
          <a href="${e(p.path)}" target="_blank" rel="noopener">${e(p.path)}</a>
          <button class="btn small" type="button" data-edit="${e(p.id)}">Edit site</button>
          <details><summary>Rename or delete</summary>
            <form data-form="project-edit" data-id="${e(p.id)}">${nameFields(`pe-${e(p.id)}`, p.name, p.slug, "Changing the address keeps the old one redirecting for 90 days. ")}
              <button class="btn ghost small" type="submit">Save</button></form>
            <form data-form="project-delete" data-id="${e(p.id)}"><div class="field"><label for="pd-${e(p.id)}">Type ${e(p.slug)} to delete</label><input id="pd-${e(p.id)}" name="confirm" required></div>
              <button class="btn ghost small" type="submit">Delete project</button></form>
          </details></li>`).join("") || "<li>No projects yet.</li>"}</ul>
        ${c.projects.length < data.limits.projectsPerCreator ? `<form data-form="project" data-creator="${e(c.id)}"><h3>New project</h3>${nameFields("pr")}<button class="btn" type="submit">Create project</button></form>` : ""}
        ${c.role === "owner" ? `<details><summary>Rename ${e(c.name)}</summary><form data-form="creator-edit" data-id="${e(c.id)}">
          ${nameFields("ce", c.name, c.slug, "Changing your address keeps the old one redirecting for 90 days. ")}<button class="btn ghost small" type="submit">Save</button></form></details>` : ""}
        <p class="msg" role="status" hidden></p>
      </section>`).join("");
  }

  async function load() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get("project")) return window.GS.studioEditor.open(root, hash.get("project"), back);
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
      return window.GS.studioEditor.open(root, res.data.project.id, back);
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
    const edit = ev.target.closest("[data-edit]");
    if (!edit) return;
    history.replaceState(null, "", `#project=${encodeURIComponent(edit.dataset.edit)}`);
    window.GS.studioEditor.open(root, edit.dataset.edit, back);
  });

  load();
})();
