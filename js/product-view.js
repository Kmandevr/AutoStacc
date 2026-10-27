// Product view template (GS.productView, for js/product-page.js and the Product Studio's live preview in
// js/studio-section-store.js and js/studio-section-release.js): the buyer-facing markup of a creator's product, from the
// store API's product shape (server/shop/page.js draws the same parts first, without the visitor's state). Pure: returns
// HTML, touches nothing. With { preview: true } the buttons are disabled and
// say "Preview", and nothing carries the hooks that add to the cart, save to a wishlist or count plays.
// Needs js/util.js and data/product-types.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents } = window.GS;

  // Store details the creator stated (labels from the API), as a list of facts.
  const FIELDS = [["Contents", "contents"], ["File formats", "format"], ["Genre", "genre"], ["Style", "style"], ["Mood", "mood"], ["Energy", "energy"],
    ["Made for", "use"], ["DAW", "daw"], ["Plugin", "plugin"], ["System", "os"], ["Key", "key"], ["Level", "skill"]];
  function details(p) {
    const f = p.facets || {}, sp = p.specs || {};
    const rows = [...FIELDS.filter(([, k]) => (f[k] || []).length).map(([t, k]) => [t, f[k].map((x) => x.label).join(", ")]),
      p.bpm ? ["BPM", p.bpm[0] === p.bpm[1] ? p.bpm[0] : `${p.bpm[0]}–${p.bpm[1]}`] : null,
      sp.sampleRate ? ["Sample rate", `${sp.sampleRate / 1000} kHz`] : null, sp.bitDepth ? ["Bit depth", `${sp.bitDepth}-bit`] : null].filter(Boolean);
    return rows.length ? `<h2>Details</h2><dl class="facts">${rows.map(([t, v]) => `<dt>${e(t)}</dt><dd>${e(v)}</dd>`).join("")}</dl>` : "";
  }

  // "What you get" (owner, 2026-10-27, #222): the download's size and file count (js/store.js fills [data-size] from the
  // store), the licence for this kind of product in one line (data/licenses.js, via data/product-types.js), and where
  // the files go. Markdown-like marks in a licence summary are dropped; everything is escaped.
  const plainText = (t) => String(t || "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  function getBox(p) {
    const key = ((window.PRODUCT_TYPES || {})[p.type] || {}).license;
    const lic = key && (window.LICENSES || {})[key];
    return `<section class="product-get" aria-labelledby="get-${e(p.id)}"><h2 id="get-${e(p.id)}">What you get</h2><ul>
        <li data-size-row hidden><strong>Download:</strong> <span data-size="${e(p.id)}"></span></li>
        ${lic ? `<li><strong>${e(lic.title)}:</strong> ${e(plainText(lic.summary))} <a href="/license#${e(key)}">Read the licence</a></li>` : ""}
        <li>${p.comingSoon ? "Once it's on sale, buying it puts the files" : "The files go"} in <a href="/library">Your Stacc</a>, yours to download again any time.</li>
      </ul></section>`;
  }

  // A Coming soon day ("YYYY-MM-DD", UTC) as people read it.
  const soonDay = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); } catch { return d; } };

  // p: the API's product; opts: { owned, preview }.
  function render(p, { owned = false, preview = false } = {}) {
    const types = window.PRODUCT_TYPES || {};
    const off = preview ? ' disabled aria-disabled="true"' : "";
    const action = preview ? `<button class="btn" type="button"${off}>${p.priceCents ? "Add to cart" : "Get it free"} · Preview</button>`
      : owned ? `<p><span class="owned-badge">STACC'D</span> <a class="btn ghost" href="/library">Open Your Stacc</a></p>`
      : p.comingSoon ? `<p class="msg coming-soon"><strong>Coming soon.</strong> On sale from ${e(soonDay(p.comingSoon.on))}.</p>`
      : p.available === false ? '<p class="msg">Not on sale right now.</p>'
      : p.free ? '<button class="btn" type="button" data-claim>Get it free</button><p class="small-print">Free with an AutoStacc account; you\'ll log in or sign up first if needed.</p>'
      : '<div class="actions"><button class="btn" type="button" data-buy>Add to cart</button><button class="btn ghost" type="button" data-buy-now>Buy now</button></div>';
    const type = (types[p.type] || {}).label || p.type || "";
    const includes = (p.metadata && p.metadata.includes) || [];
    return `
      ${p.artwork ? `<img class="product-art" src="${e(p.artwork)}" alt="" width="480" height="480">` : ""}
      <div class="product-info">
        <p class="small-print">${e(type)}${p.creator ? ` · by <a href="${e(p.projectPath || p.creator.path)}">${e(p.projectName || p.creator.name)}</a>` : ""}${p.verified === false ? ' <span class="tag unverified">Unverified creator</span>' : ""}</p>
        ${p.verified === false ? `<p class="msg unverified-note" role="note">AutoStacc hasn't verified this creator. Their files are checked automatically to be what their names say, not for quality or who owns the rights, so buy only from creators you trust. <a href="/refunds">Refunds</a> work as usual.</p>` : ""}
        ${p.preview ? `<figure class="preview"><figcaption>Preview</figcaption><audio controls preload="none" src="${e(p.preview)}"${preview ? "" : ` data-preview="${e(p.id)}"`}></audio></figure>` : ""}
        <p class="product-price">${p.priceCents ? e(cents(p.priceCents, p.currency)) : "Free"}${p.sale ? ` <s class="small-print">${e(cents(p.listPriceCents, p.currency))}</s>` : ""}</p>
        ${p.description ? `<p class="product-desc">${e(p.description)}</p>` : ""}
        ${includes.length ? `<h2>What's inside</h2><ul>${includes.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
        ${p.tags && p.tags.length ? `<p class="small-print">${p.tags.map((t) => `<span class="tag">${e(t)}</span>`).join(" ")}</p>` : ""}
        ${details(p)}
        ${action}
        ${preview ? `<button class="btn ghost wish-btn" type="button"${off}>Save to wishlist</button>`
          : (p.available !== false || p.comingSoon) && !owned ? `<button class="btn ghost wish-btn" type="button" data-wish="${e(p.id)}" aria-pressed="false">Save to wishlist</button>` : ""}
        ${preview ? "" : '<p class="msg" role="status" hidden></p>'}
        ${preview ? "" : getBox(p)}
        ${!preview && p.creator ? `<section class="made-by" aria-label="Made by">
          <p class="card-type">Made by</p>
          <p><a href="${e(p.projectPath || p.creator.path)}"><strong>${e(p.projectName || p.creator.name)}</strong></a>${p.projectName ? ` · from <a href="${e(p.creator.path)}">${e(p.creator.name)}</a>` : ""}</p>
          ${p.projectId ? `<p><a class="btn ghost small" href="/shop?creator=${encodeURIComponent(p.projectId)}">More from ${e(p.projectName || p.creator.name)}</a></p>` : ""}
          <div class="project-follow" data-follow-slot="${e(p.projectId || "")}" data-name="${e(p.projectName || "")}"></div>
        </section>` : ""}
        <p class="small-print">By buying you accept the <a href="/terms">terms</a> and the <a href="/license">licence</a> for this kind of product. <a href="/refunds">Refunds</a>.</p>
      </div>`;
  }

  window.GS.productView = { render };
})();
