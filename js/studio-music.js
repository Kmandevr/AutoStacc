// Studio Music (GS.studioContent.kinds.music, for js/studio-content.js): a release's fields (title, type, date, address,
// UPC, description, artwork from the creator's own images with alt text, tracks, credits, players, listening links,
// tags, featured), uploading an image for the artwork, and reading the form under the API's field names
// (/api/studio/.../releases; checked again by server/content/clean.js). Needs js/util.js and js/studio-content.js.
(function () {
  "use strict";

  const C = window.GS.studioContent;
  if (!C) return;
  const { $, escapeHTML: e, api, say } = window.GS;
  const { field, area, slug, tags, readTags, value } = C.form;
  const ROWS = {
    tracks: { label: "Tracks", add: "Add a track", cols: [["title", "Title", "required maxlength=\"200\""], ["duration", "Length (m:ss)", "maxlength=\"8\" pattern=\"\\d{1,3}:[0-5]\\d\""], ["isrc", "ISRC", "maxlength=\"12\""]] },
    credits: { label: "Credits", add: "Add a credit", cols: [["role", "Role", "required maxlength=\"80\""], ["name", "Name", "required maxlength=\"120\""]] },
    links: { label: "Listen on", add: "Add a link", cols: [["name", "Service", "required maxlength=\"60\""], ["url", "Link (https)", "required type=\"url\" maxlength=\"500\""]] }
  };

  const row = (key, v = {}) => `<li class="cx-row">${ROWS[key].cols.map(([k, label, attrs]) =>
    `<label class="cx-cell"><span>${label}</span><input data-k="${k}" value="${e(v[k] ?? "")}" ${attrs}></label>`).join("")}
    <button class="btn ghost small" type="button" data-act="row-remove">Remove<span class="sr-only"> this ${ROWS[key].label.toLowerCase()} row</span></button></li>`;
  const rows = (key, list = []) => `<fieldset class="cx-rows" data-rows="${key}"><legend>${ROWS[key].label}</legend>
    <ol class="cx-row-list">${list.map((v) => row(key, v)).join("")}</ol>
    <button class="btn ghost small" type="button" data-act="row-add">${ROWS[key].add}</button></fieldset>`;
  const readRows = (f, key) => [...$(`[data-rows=${key}]`, f).querySelectorAll(".cx-row")]
    .map((li) => Object.fromEntries([...li.querySelectorAll("[data-k]")].map((i) => [i.dataset.k, i.value.trim()])))
    .filter((o) => Object.values(o).some(Boolean));

  const artOptions = (images, art) => `<option value="">No artwork</option>
    ${art && !art.asset ? '<option value="keep" selected>Current artwork</option>' : ""}
    ${images.map((i) => `<option value="${e(i.id)}"${art && art.asset === i.id ? " selected" : ""}>${e(i.filename)}</option>`).join("")}`;

  function fields(x, s) {
    const art = x.artwork || null;
    const providers = (s.embedProviders || []).join(", ");
    return `${field("title", "Title", x.title, 'required maxlength="200"')}
      <div class="cx-pair">
        <div class="field"><label for="cx-type">Type</label><select id="cx-type" name="type">${["Single", "EP", "Album"].map((t) => `<option${x.type === t ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        ${field("date", "Release date", x.date, 'type="date" required')}
      </div>
      ${slug(x, "music")}
      ${field("upc", "UPC (optional)", x.upc, 'inputmode="numeric" pattern="\\d{12,14}" maxlength="14"')}
      ${area("description", "Description", x.description, 'maxlength="2000"')}
      ${tags(x)}
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

  // The form's values under the API's field names (the address is added by js/studio-content.js).
  async function collect(f, x, s) {
    const v = (k) => value(f, k);
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
    return { title: v("title"), date: v("date"), type: v("type"), upc: v("upc") || null, description: v("description"), artwork, tags: readTags(f),
      tracks: readRows(f, "tracks").map((t) => ({ ...t, isrc: t.isrc.toUpperCase().replace(/-/g, "") })),
      credits: readRows(f, "credits"), embedUrl: v("embedUrl") || null, fallbackEmbedUrl: v("fallbackEmbedUrl") || null,
      links: readRows(f, "links"), featured: $("[name=featured]", f).checked };
  }

  // Picking artwork previews it; an upload joins the creator's images and is picked at once.
  async function change(t, s, current) {
    const f = t.form;
    if (t.matches("[data-art]")) {
      const img = $(".cx-art-preview", f), pick = s.images.find((i) => i.id === t.value);
      img.src = pick ? pick.src : t.value === "keep" ? current.artworkSrc || "" : "";
      img.hidden = !img.getAttribute("src");
    }
    if (!t.matches("[data-act=upload]") || !t.files || !t.files[0]) return;
    const file = t.files[0];
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
  }

  // Adding and removing track, credit and link rows; true when the click was one of these.
  function click(act, b) {
    if (act !== "row-add" && act !== "row-remove") return false;
    const fs = b.closest("[data-rows]");
    if (act === "row-add") {
      $(".cx-row-list", fs).insertAdjacentHTML("beforeend", row(fs.dataset.rows));
      $(".cx-row:last-child input", fs).focus();
    } else {
      b.closest(".cx-row").remove();
      $("[data-act=row-add]", fs).focus();
    }
    return true;
  }

  // The creator's id, for uploads (the content API names the project only).
  async function load(s) {
    const top = await api("/api/studio");
    const owner = top.ok && top.data.creators.find((c) => c.projects.some((p) => p.id === s.projectId));
    s.creatorId = owner ? owner.id : "";
  }

  C.kinds.music = {
    kind: "releases", title: "Music", one: "release", thumb: true, fields, collect, change, click, load,
    name: (x) => x.title, meta: (x) => `${x.type} · ${x.date}`,
    // One featured release per project: saving one featured unmarks the rest.
    saved: (s, x) => { if (x.featured) s.items = s.items.map((y) => (y.id === x.id ? y : { ...y, featured: false })); }
  };
})();
