// "What's inside" on a product's page ([data-product-contents="<product id>"], or the Studio product page's ?p=): what
// the product's published files contain, before anyone buys it (GET /api/products/:id/contents; docs/packs.md
// Phase 7): how many files and how big, their kinds, tempo range, formats, keys and the rest, the Pacs' public preview
// clips and read me, and the folders with their files. Only for products whose files were published from the Pack
// Builder; stays hidden otherwise, when switched off, or when the store is offline. Names and sizes only, never a link
// to a file (the clips are public previews). Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, api } = window.GS;
  const root = document.querySelector("[data-product-contents]");
  if (!root || (window.FEATURES && window.FEATURES["product.contentsTree"] === false)) return;
  const size = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const SHOWN = ["format", "instrument", "key", "sample-rate", "bit-depth", "daw", "plugin"];

  (async () => {
    const id = root.dataset.productContents || new URLSearchParams(location.search).get("p") || "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
    const res = await api(`/api/products/${encodeURIComponent(id)}/contents`);
    if (!res.ok || !res.data.files) return;
    const c = res.data;
    const facts = c.facets.filter((g) => SHOWN.includes(g.id)).sort((a, b) => SHOWN.indexOf(a.id) - SHOWN.indexOf(b.id))
      .map((g) => `<dt>${e(g.label)}</dt><dd>${g.values.sort((a, b) => b.count - a.count).map((v) => `${e(v.label)} <span class="small-print">(${v.count})</span>`).join(", ")}</dd>`).join("");
    // The Pacs' public preview clips (up to 3 each, from the API) and the read me's text, only when there are any.
    const clips = (Array.isArray(c.previews) ? c.previews : []).filter((x) => x && typeof x.url === "string" && /^\/media\//.test(x.url));
    const previews = clips.length ? `<ul class="pac-previews">${clips.map((x) => `<li><span class="pac-preview-title">${e(x.title || "Preview")}</span>
        <audio controls preload="none" src="${e(x.url)}" aria-label="${e(`Preview: ${x.title || "Preview"}`)}"></audio></li>`).join("")}</ul>` : "";
    const readme = typeof c.readme === "string" && c.readme.trim() ? `<details class="pac-readme"><summary>Read me</summary><pre>${e(c.readme)}</pre></details>` : "";
    const kinds = c.kinds.sort((a, b) => b.count - a.count).map((k) => `${e(k.label)} (${k.count})`).join(", ");
    const folders = c.folders.map((f) => `<details class="contents-folder"${c.folders.length <= 3 ? " open" : ""}>
        <summary>${e(f.path ? f.path.split("/").join(" › ") : "Top level")} <span class="small-print">${plural(f.files.length, "file")}</span></summary>
        <ul class="contents-files">${f.files.map((x) => `<li><span>${e(x.name)}</span> <span class="small-print">${[x.kind, x.format, size(x.sizeBytes)].filter(Boolean).map(e).join(" · ")}</span></li>`).join("")}</ul>
      </details>`).join("");
    root.innerHTML = `<div class="wrap"><div class="store-section-head"><h2 id="contents-head">What's inside</h2>
        <p class="small-print">${plural(c.files, "file")}, ${size(c.bytes)}${kinds ? `: ${kinds}` : ""}. Worked out from the files themselves.</p></div>
      <dl class="facts">${c.bpm ? `<dt>BPM</dt><dd>${c.bpm[0] === c.bpm[1] ? c.bpm[0] : `${c.bpm[0]}–${c.bpm[1]}`}</dd>` : ""}${facts}</dl>
      ${previews}${readme}
      <div class="contents-tree">${folders}</div>
      ${c.truncated ? `<p class="small-print">The first 2,000 files are listed.</p>` : ""}</div>`;
    root.setAttribute("aria-labelledby", "contents-head");
    root.hidden = false;
  })();
})();
