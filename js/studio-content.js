// Studio content (GS.studioContent, for js/studio.js): one project's Music (releases), News and Shows for every creator,
// first-party included (#content=<projectId>&kind=music|news|shows, &item=<id>|new reopens an editor). Each item is a
// draft until published; publishing, unpublishing, changing what is live and deleting show only when the API says the
// member may (canPublish). Artwork is one of the creator's uploaded images with alt text; a news body is the safe text
// markup of js/site-text.js (never HTML), previewed as it will read. The server checks every field
// (server/content/clean.js). Needs js/util.js, js/site-text.js and js/site-embeds.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api, say } = window.GS;
  const VIEWS = {
    music: { kind: "releases", title: "Music", one: "release", name: (x) => x.title, meta: (x) => `${x.type} · ${x.date}` },
    news: { kind: "news", title: "News", one: "post", name: (x) => x.title, meta: (x) => `${x.date}${x.tag ? ` · ${x.tag}` : ""}` },
    shows: { kind: "shows", title: "Shows", one: "show", name: (x) => [x.city, x.venue].filter(Boolean).join(" · "), meta: (x) => x.date }
  };
  const ROWS = {
    tracks: { label: "Tracks", add: "Add a track", cols: [["title", "Title", "required maxlength=\"200\""], ["duration", "Length (m:ss)", "maxlength=\"8\" pattern=\"\\d{1,3}:[0-5]\\d\""], ["isrc", "ISRC", "maxlength=\"12\""]] },
    credits: { label: "Credits", add: "Add a credit", cols: [["role", "Role", "required maxlength=\"80\""], ["name", "Name", "required maxlength=\"120\""]] },
    links: { label: "Listen on", add: "Add a link", cols: [["name", "Service", "required maxlength=\"60\""], ["url", "Link (https)", "required type=\"url\" maxlength=\"500\""]] }
  };
  const SLUG = "[a-z0-9]+(-[a-z0-9]+)*";
  const same = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

  const field = (k, label, value, attrs = "", hint = "") => `<div class="field"><label for="cx-${k}">${label}</label>
    <input id="cx-${k}" name="${k}" value="${e(value ?? "")}" ${attrs}>${hint ? `<p class="small-print">${hint}</p>` : ""}</div>`;
  const area = (k, label, value, attrs = "", hint = "") => `<div class="field"><label for="cx-${k}">${label}</label>
    <textarea id="cx-${k}" name="${k}" rows="4" ${attrs}>${e(value ?? "")}</textarea>${hint ? `<p class="small-print">${hint}</p>` : ""}</div>`;
  const row = (key, v = {}) => `<li class="cx-row">${ROWS[key].cols.map(([k, label, attrs]) =>
    `<label class="cx-cell"><span>${label}</span><input data-k="${k}" value="${e(v[k] ?? "")}" ${attrs}></label>`).join("")}
    <button class="btn ghost small" type="button" data-act="row-remove">Remove<span class="sr-only"> this ${ROWS[key].label.toLowerCase()} row</span></button></li>`;
  const rows = (key, list = []) => `<fieldset class="cx-rows" data-rows="${key}"><legend>${ROWS[key].label}</legend>
    <ol class="cx-row-list">${list.map((v) => row(key, v)).join("")}</ol>
    <button class="btn ghost small" type="button" data-act="row-add">${ROWS[key].add}</button></fieldset>`;
  const readRows = (f, key) => [...$(`[data-rows=${key}]`, f).querySelectorAll(".cx-row")]
    .map((li) => Object.fromEntries([...li.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.value.trim()])))
    .filter((o) => Object.values(o).some(Boolean));

  // ---------- each kind's fields ----------
  const artOptions = (images, art) => `<option value="">No artwork</option>
    ${art && !art.asset ? '<option value="keep" selected>Current artwork</option>' : ""}
    ${images.map((i) => `<option value="${e(i.id)}"${art && art.asset === i.id ? " selected" : ""}>${e(i.filename)}</option>`).join("")}`;

  function releaseFields(x, s) {
    const art = x.artwork || null;
    const providers = (s.embedProviders || []).join(", ");
    return `${field("title", "Title", x.title, 'required maxlength="200"')}
      <div class="cx-pair">
        <div class="field"><label for="cx-type">Type</label><select id="cx-type" name="type">${["Single", "EP", "Album"].map((t) => `<option${x.type === t ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        ${field("date", "Release date", x.date, 'type="date" required')}
      </div>
      ${slugField(x, "music")}
      ${field("upc", "UPC (optional)", x.upc, 'inputmode="numeric" pattern="\\d{12,14}" maxlength="14"')}
      ${area("description", "Description", x.description, 'maxlength="2000"')}
      <fieldset class="cx-art"><legend>Artwork</legend>
        <img class="cx-art-preview" src="${e(x.artworkSrc || "")}" alt="" width="120" height="120"${x.artworkSrc ? "" : " hidden"}>
        <div class="field"><label for="cx-art">Image</label><select id="cx-art" data-art>${artOptions(s.images || [], art)}</select>
          <p class="small-print">Pick one of your uploaded images, or upload one here.</p></div>
        ${s.creatorId ? '<label class="btn ghost small cx-upload">Upload an image<input class="cx-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-act="upload"></label>' : ""}
        ${field("artAlt", "Alt text: what the artwork shows", art ? art.alt : "", 'maxlength="300"')}
      </fieldset>
      ${rows("tracks", x.tracks)}${rows("credits", x.credits)}
      ${field("embedUrl", "Player link", x.embedUrl, 'type="url" maxlength="500"', `A share link from ${e(providers)}. It plays on the release page.`)}
      ${field("fallbackEmbedUrl", "Second player (optional)", x.fallbackEmbedUrl, 'type="url" maxlength="500"', "Shown if the first player can't load.")}
      ${rows("links", x.links)}
      <label class="cx-check"><input type="checkbox" name="featured"${x.featured ? " checked" : ""}> Featured: the release the project's pages lead with</label>`;
  }

  const newsFields = (x, s) => `${field("title", "Title", x.title, 'required maxlength="200"')}
    <div class="cx-pair">${field("date", "Date", x.date, 'type="date" required')}${field("tag", "Tag (optional)", x.tag, 'maxlength="40" list="cx-tags"')}</div>
    <datalist id="cx-tags">${[...new Set(s.items.map((n) => n.tag).filter(Boolean))].map((t) => `<option value="${e(t)}">`).join("")}</datalist>
    ${slugField(x, "news")}
    <div class="field"><label for="cx-release">About a release (optional)</label><select id="cx-release" name="release"><option value="">None</option>
      ${(s.releases || []).map((r) => `<option value="${e(r.slug)}"${x.release === r.slug ? " selected" : ""}>${e(r.title)}</option>`).join("")}</select></div>
    ${area("summary", "Summary", x.summary, 'maxlength="300" rows="2"', "One or two sentences for lists and link previews.")}
    ${area("body", "Post", x.body, 'maxlength="20000" rows="10"', "Plain text: a blank line starts a new paragraph, **bold**, *italic*, [label](https://link).")}
    <div class="cx-preview-wrap"><p class="small-print">Preview</p><div class="cx-preview" data-preview>${window.GS.siteText.markup(x.body || "")}</div></div>`;

  const showFields = (x) => `<div class="cx-pair">${field("date", "Date", x.date, 'type="date" required')}${field("city", "City", x.city, 'required maxlength="120"')}</div>
    ${field("venue", "Venue (optional)", x.venue, 'maxlength="120"')}
    ${field("ticketUrl", "Ticket link (optional)", x.ticketUrl, 'type="url" maxlength="500"', "An https link.")}`;

  const slugField = (x, folder) => field("slug", "Address", x.slug, `pattern="${SLUG}" maxlength="60"${x.published ? " disabled" : ""}`,
    x.published ? "A published page keeps its address." : `The last part of the page's address (…/${folder}/<em>address</em>). Leave it empty to make one from the title.`);

  const FIELDS = { releases: releaseFields, news: newsFields, shows: showFields };

  // The form's values under the API's field names.
  async function collect(f, kind, x, s) {
    const v = (k) => ($(`[name=${k}]`, f) || {}).value?.trim() ?? "";
    if (kind === "shows") return { date: v("date"), city: v("city"), venue: v("venue"), ticketUrl: v("ticketUrl") || null };
    const out = { title: v("title"), date: v("date") };
    const slug = $("[name=slug]", f);
    if (!slug.disabled && slug.value.trim()) out.slug = slug.value.trim();
    if (kind === "news") return { ...out, tag: v("tag"), release: v("release") || null, summary: v("summary"), body: $("[name=body]", f).value };
    const sel = $("[data-art]", f).value, alt = v("artAlt");
    let artwork = null;
    if (sel === "keep") artwork = { ...x.artwork, alt };
    else if (sel && x.artwork && x.artwork.asset === sel) artwork = { asset: sel, width: x.artwork.width, height: x.artwork.height, alt };
    else if (sel) {
      const img = new Image();
      img.src = (s.images.find((i) => i.id === sel) || {}).src || "";
      await img.decode().catch(() => null);
      if (!img.naturalWidth) throw new Error("That image didn't load. Pick it again, or another one.");
      artwork = { asset: sel, width: img.naturalWidth, height: img.naturalHeight, alt };
    }
    return { ...out, type: v("type"), upc: v("upc") || null, description: v("description"), artwork,
      tracks: readRows(f, "tracks").map((t) => ({ ...t, isrc: t.isrc.toUpperCase().replace(/-/g, "") })),
      credits: readRows(f, "credits"), embedUrl: v("embedUrl") || null, fallbackEmbedUrl: v("fallbackEmbedUrl") || null,
      links: readRows(f, "links"), featured: $("[name=featured]", f).checked };
  }

  // ---------- the views ----------
  function list(root, s) {
    const V = VIEWS[s.view];
    const item = (x) => `<li class="cx-item">
      ${s.view === "music" ? `<span class="cx-thumb">${x.artworkSrc ? `<img src="${e(x.artworkSrc)}" alt="" width="64" height="64" loading="lazy">` : ""}</span>` : ""}
      <div class="cx-info"><h3>${e(V.name(x))}</h3><p class="cx-meta">${e(V.meta(x))}</p>
        <span class="ws-status" data-tone="${x.published ? "good" : "neutral"}">${x.published ? "Live" : "Draft"}</span>${x.featured ? ' <span class="ws-status">Featured</span>' : ""}</div>
      <div class="cx-item-actions"><button class="btn small" type="button" data-act="open" data-id="${e(x.id)}">Edit<span class="sr-only"> ${e(V.name(x))}</span></button>
        ${x.published && x.path ? `<a class="btn ghost small" href="${e(x.path)}" target="_blank" rel="noopener">View<span class="sr-only"> ${e(V.name(x))} (opens in a new tab)</span></a>` : ""}</div></li>`;
    root.innerHTML = `${bar(s)}
      <p class="small-print">${s.items.length} of ${s.max}. New ${V.one}s start as drafts${s.canPublish ? "" : "; an owner, admin or publisher puts them live"}.</p>
      <ul class="cx-list">${s.items.map(item).join("") || `<li class="studio-empty">No ${V.one}s yet.</li>`}</ul>
      ${s.items.length < s.max ? `<button class="btn" type="button" data-act="open" data-id="new">New ${V.one}</button>` : ""}
      <p class="msg" role="status"></p>`;
  }

  const bar = (s) => `<div class="studio-bar"><button class="btn ghost" type="button" data-act="back">&larr; All projects</button><h2>${VIEWS[s.view].title}</h2></div>
    <nav class="cx-tabs" aria-label="Project content">${Object.entries(VIEWS).map(([k, V]) =>
      `<a href="#content=${encodeURIComponent(s.projectId)}&amp;kind=${k}"${k === s.view ? ' aria-current="page"' : ""}>${V.title}</a>`).join("")}</nav>`;

  function form(root, s, x) {
    const V = VIEWS[s.view];
    const fresh = !x.id;
    const locked = x.published && !s.canPublish;
    root.innerHTML = `${bar(s)}
      <form class="panel cx-form" data-cx novalidate>
        <h3 tabindex="-1">${fresh ? `New ${V.one}` : e(V.name(x))} <span class="ws-status" data-tone="${x.published ? "good" : "neutral"}">${x.published ? "Live" : "Draft"}</span></h3>
        ${locked ? `<p class="msg" role="status">This ${V.one} is live: only owners, admins and publishers change it.</p>` : ""}
        <fieldset class="cx-fields"${locked ? " disabled" : ""}>${FIELDS[s.kind](x, s)}</fieldset>
        <div class="cx-actions">
          ${locked ? "" : `<button class="btn" type="submit">${x.published ? "Save changes" : "Save draft"}</button>`}
          ${s.canPublish && !x.published ? '<button class="btn ghost" type="submit" data-publish="true">Save and publish</button>' : ""}
          ${s.canPublish && x.published ? '<button class="btn ghost" type="submit" data-publish="false">Unpublish</button>' : ""}
          ${x.published && x.path ? `<a class="btn ghost" href="${e(x.path)}" target="_blank" rel="noopener">View<span class="sr-only"> (opens in a new tab)</span></a>` : ""}
          <button class="btn ghost" type="button" data-act="list">Back to ${V.title}</button>
          ${s.canPublish && !fresh ? '<button class="btn ghost danger" type="button" data-act="delete">Delete</button>' : ""}
        </div>
        <p class="msg" role="status"></p>
      </form>`;
    const h = $(".cx-form h3", root);
    if (h) h.focus();
  }

  function openView(root, projectId, view, onBack, itemId) {
    view = VIEWS[view] ? view : "music";
    const kind = VIEWS[view].kind;
    const s = { projectId, view, kind, items: [], max: 0, canPublish: false };
    const base = `/api/studio/projects/${encodeURIComponent(projectId)}/${kind}`;
    const url = (id) => `/api/studio/${kind}/${encodeURIComponent(id)}`;
    const mark = (id) => history.replaceState(null, "", `#content=${encodeURIComponent(projectId)}&kind=${view}${id ? `&item=${encodeURIComponent(id)}` : ""}`);
    let current = null;
    const show = (id) => {
      current = id === "new" ? {} : s.items.find((x) => x.id === id);
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

    root.oninput = (ev) => {
      const preview = ev.target.name === "body" && ev.target.closest("form[data-cx]") && $("[data-preview]", root);
      if (preview) preview.innerHTML = window.GS.siteText.markup(ev.target.value);
    };
    root.onchange = async (ev) => {
      const t = ev.target;
      if (!t.closest("form[data-cx]")) return;
      if (t.matches("[data-art]")) {
        const img = $(".cx-art-preview", root), pick = s.images.find((i) => i.id === t.value);
        img.src = pick ? pick.src : t.value === "keep" ? current.artworkSrc || "" : "";
        img.hidden = !img.getAttribute("src");
      }
      if (!t.matches("[data-act=upload]") || !t.files || !t.files[0]) return;
      const file = t.files[0], f = t.form;
      say(f, "Uploading…");
      const res = await fetch(`/api/studio/creators/${encodeURIComponent(s.creatorId)}/images?filename=${encodeURIComponent(file.name)}`,
        { method: "PUT", body: file, credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" } }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) : {};
      t.value = "";
      if (!res || !res.ok) return say(f, (body.error && body.error.message) || "The upload didn't work. Try again.", true);
      s.images.unshift({ id: body.image.id, src: body.image.src, filename: body.image.filename });
      const sel = $("[data-art]", f);
      sel.innerHTML = artOptions(s.images, current.artwork);
      sel.value = body.image.id;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      say(f, `${body.image.filename} uploaded and picked. Add its alt text, then save.`);
    };
    root.onclick = async (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "back") return onBack();
      if (act === "list") return toList();
      if (act === "open") return show(b.dataset.id);
      if (act === "row-add") {
        const fs = b.closest("[data-rows]");
        $(".cx-row-list", fs).insertAdjacentHTML("beforeend", row(fs.dataset.rows));
        return $(".cx-row:last-child input", fs).focus();
      }
      if (act === "row-remove") {
        const fs = b.closest("[data-rows]");
        b.closest(".cx-row").remove();
        return $("[data-act=row-add]", fs).focus();
      }
      if (act !== "delete" || !confirm(`Delete "${VIEWS[view].name(current)}"? It comes off the site at once.`)) return;
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
        const values = publish === false ? {} : await collect(f, kind, current, s);
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
      if (kind === "releases" && saved.featured) s.items = s.items.map((x) => (x.id === saved.id ? x : { ...x, featured: false }));
      show(saved.id);
      say($("form[data-cx]", root), publish === true ? "Published." : publish === false ? "Back to draft: it's off the site." : "Saved.");
    };

    root.innerHTML = '<p class="msg pending">Loading…</p>';
    (async () => {
      const [res, rel, top] = await Promise.all([api(base), kind === "news" ? api(`/api/studio/projects/${encodeURIComponent(projectId)}/releases`) : null,
        kind === "releases" ? api("/api/studio") : null]);
      if (!res.ok) { root.innerHTML = `${bar(s)}<p class="msg error">${e(res.error.message)}</p>`; return; }
      Object.assign(s, { items: res.data.items, max: res.data.max, canPublish: res.data.canPublish, images: res.data.images || [], embedProviders: res.data.embedProviders || [] });
      if (rel && rel.ok) s.releases = rel.data.items;
      // The creator's id, for uploads (the content API names the project only).
      const owner = top && top.ok && top.data.creators.find((c) => c.projects.some((p) => p.id === projectId));
      s.creatorId = owner ? owner.id : "";
      show(itemId || null);
    })();
  }

  window.GS.studioContent = { open: openView };
})();
