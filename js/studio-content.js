// Studio content (GS.studioContent, for js/studio.js): one project's Music (releases) and Events for every creator,
// first-party included (#content=<projectId>&kind=music|events, &item=<id>|new reopens an editor). Each item is a draft
// until published; publishing, unpublishing, changing what is live and deleting show only when the API says the member
// may (canPublish). Each kind's fields and how it reads its form come from js/studio-music.js and js/studio-events.js
// (GS.studioContent.kinds, loaded after this file); the shared form pieces are GS.studioContent.form. The server
// checks every field (server/content/clean.js). Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api, say } = window.GS;
  const kinds = {}; // view key ("music", "events") -> its spec, filled in by js/studio-music.js and js/studio-events.js
  const OLD = { shows: "events" }; // addresses saved before Shows became Events
  const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
  const hint = (h) => (h ? `<p class="small-print">${h}</p>` : "");

  // ---------- form pieces each kind uses ----------
  const kit = {
    field: (k, label, value, attrs = "", h = "") => `<div class="field"><label for="cx-${k}">${label}</label>
      <input id="cx-${k}" name="${k}" value="${e(value ?? "")}" ${attrs}>${hint(h)}</div>`,
    area: (k, label, value, attrs = "", h = "") => `<div class="field"><label for="cx-${k}">${label}</label>
      <textarea id="cx-${k}" name="${k}" rows="4" ${attrs}>${e(value ?? "")}</textarea>${hint(h)}</div>`,
    slug: (x, folder) => kit.field("slug", "Address", x.slug, `pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="60"${x.published ? " disabled" : ""}`,
      x.published ? "A published page keeps its address." : `The last part of the page's address (…/${folder}/<em>address</em>). Leave it empty to make one from the title.`),
    // Tags follow the one tag rule (server/lib/tags.js): up to 8, typed with suggestions (js/tag-input.js, data-tag-input).
    tags: (x) => kit.field("tags", "Tags (optional)", (x.tags || []).join(", "), 'maxlength="400" autocapitalize="off" spellcheck="false" data-tag-input',
      "Up to 8. Type a tag and pick a suggestion, or press Enter. People find things by them."),
    readTags: (f) => [...new Set((($("[name=tags]", f) || {}).value || "").split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    value: (f, k) => (($(`[name=${k}]`, f) || {}).value || "").trim(),
    // The slug only when it may change and was typed.
    slugValue: (f) => { const s = $("[name=slug]", f); return s && !s.disabled && s.value.trim() ? { slug: s.value.trim() } : {}; }
  };

  // ---------- the views ----------
  const bar = (s) => `<div class="studio-bar"><button class="btn ghost" type="button" data-act="back">&larr; All projects</button><h2>${kinds[s.view].title}</h2></div>
    <nav class="cx-tabs" aria-label="Project content">${Object.entries(kinds).map(([k, K]) =>
      `<a href="#content=${encodeURIComponent(s.projectId)}&amp;kind=${k}"${k === s.view ? ' aria-current="page"' : ""}>${K.title}</a>`).join("")}</nav>`;

  function list(root, s) {
    const K = kinds[s.view];
    const item = (x) => `<li class="cx-item">
      ${K.thumb ? `<span class="cx-thumb">${x.artworkSrc ? `<img src="${e(x.artworkSrc)}" alt="" width="64" height="64" loading="lazy">` : ""}</span>` : ""}
      <div class="cx-info"><h3>${e(K.name(x))}</h3><p class="cx-meta">${e(K.meta(x))}</p>
        <span class="ws-status" data-tone="${x.published ? "good" : "neutral"}">${x.published ? "Live" : "Draft"}</span>${x.featured ? ' <span class="ws-status">Featured</span>' : ""}
        ${(x.tags || []).length ? `<ul class="cx-tags" aria-label="Tags">${x.tags.map((t) => `<li>${e(t)}</li>`).join("")}</ul>` : ""}</div>
      <div class="cx-item-actions"><button class="btn small" type="button" data-act="open" data-id="${e(x.id)}">Edit<span class="sr-only"> ${e(K.name(x))}</span></button>
        ${x.published && x.path ? `<a class="btn ghost small" href="${e(x.path)}" target="_blank" rel="noopener">View<span class="sr-only"> ${e(K.name(x))} (opens in a new tab)</span></a>` : ""}</div></li>`;
    root.innerHTML = `${bar(s)}
      <p class="small-print">${s.items.length} of ${s.max}. New ${K.one}s start as drafts${s.canPublish ? "" : "; an owner, admin or publisher puts them live"}.</p>
      <ul class="cx-list">${s.items.map(item).join("") || `<li class="studio-empty">No ${K.one}s yet.</li>`}</ul>
      ${s.items.length < s.max ? `<button class="btn" type="button" data-act="open" data-id="new">New ${K.one}</button>` : ""}
      <p class="msg" role="status"></p>`;
  }

  function form(root, s, x) {
    const K = kinds[s.view];
    const fresh = !x.id;
    const locked = x.published && !s.canPublish;
    root.innerHTML = `${bar(s)}
      <form class="panel cx-form" data-cx novalidate>
        <h3 tabindex="-1">${fresh ? `New ${K.one}` : e(K.name(x))} <span class="ws-status" data-tone="${x.published ? "good" : "neutral"}">${x.published ? "Live" : "Draft"}</span></h3>
        ${locked ? `<p class="msg" role="status">This ${K.one} is live: only owners, admins and publishers change it.</p>` : ""}
        <fieldset class="cx-fields"${locked ? " disabled" : ""}>${K.fields(x, s)}</fieldset>
        <div class="cx-actions">
          ${locked ? "" : `<button class="btn" type="submit">${x.published ? "Save changes" : "Save draft"}</button>`}
          ${s.canPublish && !x.published ? '<button class="btn ghost" type="submit" data-publish="true">Save and publish</button>' : ""}
          ${s.canPublish && x.published ? '<button class="btn ghost" type="submit" data-publish="false">Unpublish</button>' : ""}
          ${x.published && x.path ? `<a class="btn ghost" href="${e(x.path)}" target="_blank" rel="noopener">View<span class="sr-only"> (opens in a new tab)</span></a>` : ""}
          <button class="btn ghost" type="button" data-act="list">Back to ${K.title}</button>
          ${s.canPublish && !fresh ? '<button class="btn ghost danger" type="button" data-act="delete">Delete</button>' : ""}
        </div>
        <p class="msg" role="status"></p>
      </form>`;
    const h = $(".cx-form h3", root);
    if (h) h.focus();
  }

  function openView(root, projectId, view, onBack, itemId) {
    view = OLD[view] || view;
    view = kinds[view] ? view : "music";
    const K = kinds[view];
    const s = { projectId, view, kind: K.kind, items: [], max: 0, canPublish: false };
    const base = `/api/studio/projects/${encodeURIComponent(projectId)}/${K.kind}`;
    const url = (id) => `/api/studio/${K.kind}/${encodeURIComponent(id)}`;
    const mark = (id) => history.replaceState(null, "", `#content=${encodeURIComponent(projectId)}&kind=${view}${id ? `&item=${encodeURIComponent(id)}` : ""}`);
    let current = null;
    const show = (id) => {
      current = id === "new" ? (K.fresh ? K.fresh() : {}) : s.items.find((x) => x.id === id);
      if (!current) { mark(null); return list(root, s); }
      mark(id);
      form(root, s, current);
    };
    const toList = (text) => { current = null; mark(null); list(root, s); if (text) say(root, text); };
    const fail = (f, res) => {
      say(f, res.error.message, true);
      const el = res.error.field && $(`[name="${res.error.field}"]`, f);
      if (el) el.focus();
    };

    root.oninput = null;
    root.onchange = (ev) => { if (K.change && ev.target.closest("form[data-cx]")) K.change(ev.target, s, current); };
    root.onclick = async (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "back") return onBack();
      if (act === "list") return toList();
      if (act === "open") return show(b.dataset.id);
      if (K.click && K.click(act, b)) return;
      if (act !== "delete" || !await window.GS.confirm(`Delete "${K.name(current)}"? It comes off the site at once.`)) return;
      b.disabled = true;
      const res = await api(url(current.id), { method: "DELETE", body: {} });
      b.disabled = false;
      if (!res.ok) return fail(b.form, res);
      s.items = s.items.filter((x) => x.id !== current.id);
      toList("Deleted.");
    };
    root.onsubmit = async (ev) => {
      const f = ev.target.closest("form[data-cx]");
      if (!f) return;
      ev.preventDefault();
      const btn = ev.submitter || $("button[type=submit]", f);
      const publish = btn.dataset.publish ? btn.dataset.publish === "true" : undefined;
      // Unpublishing needs no valid fields; anything else checks the form first.
      if (publish !== false && !f.reportValidity()) return;
      btn.disabled = true;
      let res;
      try {
        const values = publish === false ? {} : { ...kit.slugValue(f), ...(await K.collect(f, current, s)) };
        if (!current.id) {
          res = await api(base, { method: "POST", body: values });
          // Kept at once, so a publish that fails next leaves an editable draft, never a second copy on retry.
          if (res.ok) { current = res.data.item; s.items = [current, ...s.items]; mark(current.id); }
          if (res.ok && publish) res = await api(url(current.id), { method: "PATCH", body: { published: true } });
        } else {
          const body = Object.fromEntries(Object.entries(values).filter(([k, v]) => !same(v, current[k])));
          if (publish !== undefined) body.published = publish;
          res = Object.keys(body).length ? await api(url(current.id), { method: "PATCH", body }) : { ok: true, data: { item: current } };
        }
      } catch (err) {
        res = { ok: false, error: { message: err.message } };
      }
      btn.disabled = false;
      if (!res.ok) return fail(f, res);
      const saved = res.data.item;
      s.items = [saved, ...s.items.filter((x) => x.id !== saved.id)];
      if (K.saved) K.saved(s, saved);
      show(saved.id);
      say($("form[data-cx]", root), publish === true ? "Published." : publish === false ? "Back to draft: it's off the site." : "Saved.");
    };

    const sk = window.GS.skeleton; // item rows as placeholders while the list loads (js/skeleton.js)
    if (sk) sk.show(root, "row", 4); else root.innerHTML = '<p class="msg pending">Loading…</p>';
    (async () => {
      const [res] = await Promise.all([api(base), K.load ? K.load(s) : null]);
      if (sk) sk.done(root);
      if (!res.ok) { root.innerHTML = `${bar(s)}<p class="msg error">${e(res.error.message)}</p>`; return; }
      Object.assign(s, { items: res.data.items, max: res.data.max, canPublish: res.data.canPublish, images: res.data.images || [], embedProviders: res.data.embedProviders || [] });
      show(itemId || null);
    })();
  }

  window.GS.studioContent = { open: openView, kinds, form: kit };
})();
