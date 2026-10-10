// Product Studio kit (GS.studioKit, shared by js/studio-workspace.js and the js/studio-section-*.js modules): a product's
// status words, release history as plain sentences, readiness lists whose items open the section that fixes them, a
// file size and a date. Pure templates: returns text or HTML, touches nothing. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, cents } = window.GS;

  const status = (p = {}) => (p.deleted ? { text: "Removed", tone: "danger" } : p.published ? (p.salesPaused ? { text: "Paused", tone: "warn" } : { text: "On sale", tone: "good" }) : { text: "Draft", tone: "neutral" });
  const size = (b = 0) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const when = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };
  const money = (c) => (typeof c === "number" ? cents(c) : "");

  // One release-history event ({ kind, detail, at }) as a sentence. Unknown kinds still read as words.
  function sentence(ev = {}) {
    const d = ev.detail || {};
    const from = d.fromCents ?? d.from, to = d.toCents ?? d.to ?? d.priceCents;
    const file = d.filename ? ` (${d.filename})` : "";
    const version = d.number ? ` ${d.number}` : "";
    const off = d.percentOff ? `${d.percentOff}% off` : d.amountOffCents ? `${money(d.amountOffCents)} off` : "";
    const S = {
      created: "Created as a draft", edited: "Store page edited", published: "Put on sale", unpublished: "Back to draft",
      paused: "Sales paused", resumed: "Sales resumed", removed: "Removed from the store", restored: "Restored",
      price_changed: typeof from === "number" && typeof to === "number" ? `Price changed from ${money(from)} to ${money(to)}` : typeof to === "number" ? `Price set to ${money(to)}` : "Price changed",
      sale_created: `Sale created${off ? `: ${off}` : ""}`, sale_ended: "Sale ended",
      file_added: `File added${file}`, file_removed: `File removed${file}`, preview_changed: "Preview clip changed",
      pac_created: "Pac created", pac_version_submitted: `Pac version${version} sent for review`, pac_version_approved: `Pac version${version} approved`,
      pac_version_refused: `Pac version${version} sent back${d.note ? `: ${d.note}` : ""}`, pac_version_published: `Pac version${version} published`,
      pac_version_discarded: `Pac version${version} discarded`
    };
    return S[ev.kind] || String(ev.kind || "Change").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  const activity = (list = []) => (list.length
    ? `<ol class="sk-activity">${list.map((ev) => `<li><span>${e(sentence(ev))}</span> <time datetime="${e(ev.at || "")}">${e(when(ev.at))}</time></li>`).join("")}</ol>`
    : '<p class="small-print">Nothing has happened yet.</p>');

  // Readiness: blocking items first, then recommendations; each opens its section ([data-sw-go], js/studio-workspace.js).
  function readiness(r = {}) {
    const item = (x) => `<li>${x.section ? `<button type="button" class="link-btn" data-sw-go="${e(x.section)}">${e(x.message)}</button>` : e(x.message)}</li>`;
    const blocking = r.blocking || [], recommended = r.recommended || [];
    return `<div class="sk-ready">
      ${blocking.length ? `<h3 class="sk-ready-h" data-kind="blocking">Fix before release (${blocking.length})</h3><ul class="sk-list" data-kind="blocking">${blocking.map(item).join("")}</ul>`
        : '<p class="sk-ok">Ready to put on sale: nothing is blocking.</p>'}
      ${recommended.length ? `<h3 class="sk-ready-h" data-kind="recommended">Recommended (${recommended.length})</h3><ul class="sk-list" data-kind="recommended">${recommended.map(item).join("")}</ul>` : ""}
    </div>`;
  }

  window.GS.studioKit = { status, size, when, money, sentence, activity, readiness };
})();
