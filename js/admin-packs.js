// Control Center, Packs tab (docs/packs.md, Phase 3): pick a Pac, upload its ZIP for one of the products that include
// it, watch the engine check it, review what it found (files kept, files refused and why, the values it suggests from
// names and headers) and publish it, or discard it. Publishing replaces this Pac's files in the product; files whose
// bytes didn't change keep their id. Also the queue of creators' versions held by the automated review, to approve or
// reject. Talks to /api/admin/packs; uploads through js/packs-upload.js, draws a version with js/packs-version.js and
// its review with js/packs-review.js; the Pac editor (js/pac-editor.js, js/pac-previews.js) builds it one file at a time.
// Starts on "gs:admin". Needs js/util.js and data/pacs.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const mb = (n) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
  const BASE = "/api/admin/packs";
  const pct = (x) => `${Math.round(x * 100)}%`;
  let el, pacId, poll;

  const pacOptions = () => (window.PACS || []).map((p) => `<option value="${e(p.id)}"${p.id === pacId ? " selected" : ""}>${e(p.title)} (${e(p.id)})</option>`).join("");

  async function showVersion(id) {
    clearTimeout(poll);
    const res = await api(`${BASE}/versions/${encodeURIComponent(id)}`);
    // Opened from the review queue with no Pac chosen: show it on its own.
    if (!$("[data-pack-version]", el)) $("[data-pack-body]", el).innerHTML = "<div data-pack-version></div>";
    const box = $("[data-pack-version]", el);
    if (!res.ok) { box.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    draw(res.data.version);
    if (res.data.version.status === "processing") poll = setTimeout(() => showVersion(id), 2500);
  }

  // Draws a version (also after each review edit, which answers the updated version).
  function draw(v) {
    const box = $("[data-pack-version]", el);
    box.dataset.id = v.id;
    box.__version = v;
    box.innerHTML = window.GS.packVersion.render(v, { admin: true });
    editor(v);
  }

  // The Pac as a file manager (js/pac-editor.js) and its preview clips (js/pac-previews.js), when a Pac is chosen.
  function editor(v) {
    const box = $("[data-pac-editor]", el);
    if (!box || !window.GS.pacEditor || !pacId) return;
    const productId = (($("#pack-product", el) || {}).value) || null;
    window.GS.pacEditor.attach(box, v, { base: BASE, draft: { url: `${BASE}/${encodeURIComponent(pacId)}/drafts`, body: { productId } },
      onChanged: draw, reload: async (id) => { await showPac(); showVersion(id); } });
    const pp = $("[data-pac-previews]", el);
    if (pp && window.GS.pacPreviews && !pp.dataset.mounted) {
      pp.dataset.mounted = "1";
      window.GS.pacPreviews.mount(pp, { url: `${BASE}/${encodeURIComponent(pacId)}/previews`, base: BASE, version: () => $("[data-pack-version]", el).__version || null });
    } else if (pp && pp.refresh) pp.refresh();
  }

  async function showPac() {
    clearTimeout(poll);
    const body = $("[data-pack-body]", el);
    if (!pacId) { body.innerHTML = ""; return; }
    const res = await api(`${BASE}/${encodeURIComponent(pacId)}`);
    if (!res.ok) { body.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const { pac, versions, products } = res.data;
    body.innerHTML = `
      ${products.length ? `<form class="panel wide" data-pack-form>
        <div class="field"><label for="pack-product">Product</label><select id="pack-product" name="product">${products.map((p) => `<option value="${e(p.id)}">${e(p.title)}</option>`).join("")}</select></div>
        <div class="field"><label for="pack-file">The Pac's contents as one ZIP</label><input id="pack-file" name="file" type="file" accept=".zip,application/zip" required data-pack-file></div>
        <div data-pack-preview aria-live="polite"></div>
        <div class="actions"><button class="btn" type="submit"${pac.draftVersionId ? " disabled data-locked" : ""}>Upload and check</button></div>
        <progress max="1" value="0" hidden></progress><p class="msg" role="status">${pac.draftVersionId ? "A version is in progress below: publish or discard it first." : ""}</p>
      </form>` : `<p class="msg">No product includes this Pac yet (a product's <code>pacs</code> in data/products.js).</p>`}
      ${products.length ? "<div data-pac-editor></div>" : ""}
      <div data-pack-version></div>
      <div data-pac-previews></div>
      ${versions.length ? `<h3>Versions</h3><ul class="plain">${versions.map((v) => `<li><button class="link" type="button" data-pack-open="${e(v.id)}">Version ${v.number}</button>
        · ${e(v.status)}${v.id === pac.liveVersionId ? " · live" : ""}${v.stats && v.stats.files !== undefined ? ` · ${v.stats.files} files` : ""}</li>`).join("")}</ul>` : ""}`;
    const current = pac.draftVersionId || pac.liveVersionId;
    if (current) showVersion(current);
    else editor(null);
  }

  // What the engine would find, listed in the browser as soon as a file is chosen (nothing uploads yet).
  async function onPick(ev) {
    const input = ev.target.closest("[data-pack-file]");
    if (!input) return;
    const box = $("[data-pack-preview]", el);
    const file = input.files[0];
    if (!file) { box.innerHTML = ""; return; }
    box.innerHTML = `<p class="small-print">Looking inside ${e(file.name)}…</p>`;
    const { result, error } = await window.GS.packPreview.list(file);
    if (error || !result) { box.innerHTML = `<p class="small-print">No preview (${e(error || "unknown")}); the upload is checked in full anyway.</p>`; return; }
    const submit = $("[data-pack-form] button[type=submit]", el);
    if (result.error) {
      box.innerHTML = `<p class="msg error">This isn't a ZIP AutoStacc can read (${e(result.error)}). Choose another file.</p>`;
      if (submit) submit.disabled = true;
      return;
    }
    if (submit && !submit.dataset.locked) submit.disabled = false;
    const files = result.files.filter((f) => !f.ignored);
    const refused = files.filter((f) => f.issues.some((i) => i.refused));
    const bytes = files.reduce((n, f) => n + f.size, 0);
    box.innerHTML = `<p>${files.length} file${files.length === 1 ? "" : "s"} in ${result.folders.length} folder${result.folders.length === 1 ? "" : "s"}, ${mb(bytes)} unpacked.</p>
      ${refused.length ? `<details open><summary>${refused.length} would be refused</summary><ul>${refused.slice(0, 50).map((f) =>
        `<li><code>${e(f.path)}</code>: ${e(f.issues.filter((i) => i.refused).map((i) => i.code).join(", "))}</li>`).join("")}</ul></details>` : ""}`;
  }

  async function onSubmit(ev) {
    const form = ev.target.closest("[data-pack-form]");
    if (!form) return;
    ev.preventDefault();
    const file = form.elements.file.files[0];
    const msg = $("[role=status]", form), bar = $("progress", form), btn = $("button[type=submit]", form);
    if (!file) return;
    btn.disabled = true;
    bar.hidden = false;
    msg.textContent = "Uploading…";
    try {
      const productId = form.elements.product.value;
      let note = "";
      const v = await window.GS.packUpload.upload({ base: BASE, create: `${BASE}/${encodeURIComponent(pacId)}/versions`, body: { productId },
        have: { url: `${BASE}/${encodeURIComponent(pacId)}/have`, body: { productId } } }, file,
        (x) => { bar.value = x; msg.textContent = `${note} Uploading… ${pct(x)}`.trim(); }, (t) => { note = t; msg.textContent = t; });
      msg.textContent = "Uploaded. Checking every file…";
      await showPac();
      showVersion(v.id);
    } catch (err) {
      msg.textContent = `${err.message} Choose the same file again to continue where it stopped.`;
      btn.disabled = false;
    }
  }

  async function onClick(ev) {
    const open = ev.target.closest("[data-pack-open]");
    if (open) return showVersion(open.dataset.packOpen);
    const act = ev.target.closest("[data-pack-publish], [data-pack-discard], [data-pack-reject]");
    if (!act) return;
    const id = $("[data-pack-version]", el).dataset.id;
    const verb = act.hasAttribute("data-pack-publish") ? "publish" : act.hasAttribute("data-pack-reject") ? "reject" : "discard";
    let body = {};
    if (verb === "publish" && !confirm("Publish this version? Customers get its files right away; files that changed or were removed are replaced.")) return;
    if (verb === "reject") {
      const note = prompt("Why isn't it accepted? The creator sees this.", "");
      if (note === null) return;
      body = { note };
    }
    act.disabled = true;
    const res = await api(`${BASE}/versions/${encodeURIComponent(id)}/${verb}`, { method: "POST", body });
    if (!res.ok) {
      act.disabled = false;
      act.closest(".actions").insertAdjacentHTML("afterend", `<p class="msg error" role="alert">${e(res.error.message)}</p>`);
      return;
    }
    dispatchEvent(new CustomEvent("gs:packs-changed"));
    if (pacId) showPac();
    else showVersion(id);
  }

  addEventListener("gs:admin", () => {
    el = $("#admin-packs");
    if (!el) return;
    el.innerHTML = `<div data-pack-queue></div>
      <p class="small-print">Upload a Pac's files as one ZIP. AutoStacc checks every file (type, damage, unsafe names), stores the originals byte for byte and suggests kinds, instruments, tempos and keys; you publish when it looks right.</p>
      <div class="field"><label for="pack-pac">Pac</label><select id="pack-pac" data-pack-pac><option value="">Choose a Pac…</option>${pacOptions()}</select></div>
      <div data-pack-body></div>`;
    $("[data-pack-pac]", el).addEventListener("change", (ev) => { pacId = ev.target.value; showPac(); });
    el.addEventListener("submit", onSubmit);
    el.addEventListener("change", onPick);
    window.GS.packReview.bind(el, draw, BASE);
    el.addEventListener("click", onClick);
  });
})();
