// Music page: a card per release (linking to its page) and the artist's official profiles. Needs data/site.js, data/music.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, parseDate, fmtDate, isSet } = window.GS;
  const MUSIC = window.MUSIC || {};
  const SITE = window.SITE || {};

  const list = $("#release-list");
  if (!list) return;

  const releases = (MUSIC.releases || []).filter((r) => !r.draft).sort((a, b) => parseDate(b.date) - parseDate(a.date));
  list.innerHTML = releases.length
    ? releases
        .map((r) => {
          const art = r.artwork || {};
          const small = (art.srcset || []).find((s) => s.type === "image/jpeg") || art;
          return `
      <li>
        <a class="release-card" href="/music/${escapeHTML(r.id)}">
          ${art.src ? `<img src="/${escapeHTML(small.src)}" width="${art.width}" height="${art.height}" alt="${escapeHTML(art.alt)}" loading="lazy" decoding="async">` : ""}
          <span class="card-body">
            <span class="tag">${escapeHTML(r.type)}</span>
            <strong>${escapeHTML(r.title)}</strong>
            <span class="meta"><time datetime="${escapeHTML(r.date)}">${fmtDate(r.date)}</time></span>
          </span>
        </a>
      </li>`;
        })
        .join("")
    : `<li class="empty">First release incoming.</li>`;

  const profiles = $("#artist-profiles");
  if (profiles) {
    const live = (SITE.socials || []).filter((s) => isSet(s.url));
    profiles.innerHTML = live
      .map((s) => `<a class="btn ghost" href="${escapeHTML(s.url)}" target="_blank" rel="me noopener">${escapeHTML(s.name)}</a>`)
      .join("");
  }
})();
