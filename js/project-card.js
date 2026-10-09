// Project card template (GS.projectCard) for the projects browser (js/projects-browse.js) and the home page's rows: a
// project as GET /api/projects/browse describes it: image or a generated tile, name, who runs it, "Unverified creator"
// until AutoStacc trusts them, tagline, genres, what it makes, how recently it was active, its next show, and a link to
// its items in the store (never a price or a buy button). js/follow.js fills the follow slot. Needs js/util.js and
// data/product-types.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e } = GS;
  const TYPES = window.PRODUCT_TYPES || {};
  const MAKES = { releases: "Music releases" };
  const makesLabel = (m) => MAKES[m] || (TYPES[m] || {}).label || m;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const DAY = 86400000;

  // "today", "3 days ago", "2 months ago": how long since a date (ISO), for "Active ...".
  function ago(iso) {
    const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
    if (d < 1) return "today";
    if (d < 2) return "yesterday";
    if (d < 45) return `${d} days ago`;
    if (d < 365) return `${Math.round(d / 30)} months ago`;
    return `${Math.round(d / 365)} year${d < 730 ? "" : "s"} ago`;
  }
  const showDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function projectCard(p, { level = 3, compact = false } = {}) {
    const initials = p.name.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    const facts = [p.releases ? plural(p.releases, "release") : "", p.items ? plural(p.items, "store item") : "", p.news ? plural(p.news, "news post") : ""].filter(Boolean);
    return `<article class="pcard${p.recent ? " is-recent" : ""} ${GS.look(p.id)}" data-project="${e(p.id)}">
      <a class="pcard-art" href="${e(p.path)}" tabindex="-1" aria-hidden="true">
        ${p.image ? `<img src="${e(p.image)}" alt="" width="96" height="96" loading="lazy">` : `<span>${e(initials || "?")}</span>`}
      </a>
      <div class="pcard-body">
        <h${level} class="pcard-name"><a href="${e(p.path)}">${e(p.name)}</a></h${level}>
        <p class="pcard-by">${p.creator && p.creator !== p.name ? `by ${e(p.creator)}` : ""}${p.verified ? "" : `${p.creator && p.creator !== p.name ? " · " : ""}<span class="tag unverified" title="AutoStacc hasn't verified this creator">Unverified creator</span>`}</p>
        ${p.tagline && !compact ? `<p class="pcard-tagline">${e(p.tagline)}</p>` : ""}
        ${p.genres.length ? `<ul class="pcard-tags" aria-label="Genres and styles">${p.genres.slice(0, 4).map((g) => `<li>${e(g.label)}</li>`).join("")}</ul>` : ""}
        ${p.makes.length && !compact ? `<p class="pcard-makes"><span class="sr-only">Makes: </span>${[...new Set(p.makes)].map((m) => `<span class="tag">${e(makesLabel(m))}</span>`).join(" ")}</p>` : ""}
        <p class="pcard-activity">${p.nextShow ? `<strong>Show ${e(showDate(p.nextShow))}</strong> · ` : ""}${p.lastActive ? `Active ${e(ago(p.lastActive))}` : "New on AutoStacc"}${facts.length ? ` · ${e(facts.join(" · "))}` : ""}</p>
        <div class="pcard-actions">
          <a class="btn small" href="${e(p.path)}">Visit<span class="sr-only"> ${e(p.name)}</span></a>
          ${p.items ? `<a class="btn ghost small" href="/shop?creator=${encodeURIComponent(p.id)}">Its items in the store<span class="sr-only">: ${e(p.name)}</span></a>` : ""}
        </div>
        ${compact ? "" : `<div class="project-follow" data-follow-slot="${e(p.id)}" data-name="${e(p.name)}"></div>`}
      </div>
    </article>`;
  }

  projectCard.makesLabel = makesLabel;
  GS.projectCard = projectCard;
})();
