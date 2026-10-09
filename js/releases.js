// Releases, a drop-in for any [data-releases] list: a card per release of a project (data/music.js, newest first),
// each linking to its page. data-project picks the project (default: the open project's); data-limit caps the cards.
// Outside the project's pages it wears the project's look. Needs data/projects.js, data/music.js and js/util.js.
(function () {
  "use strict";

  const { escapeHTML, parseDate, fmtDate, moduleProject, wear } = window.GS;
  const lists = [...document.querySelectorAll("[data-releases]")];
  if (!lists.length) return;
  const RELEASES = ((window.MUSIC || {}).releases || []).filter((r) => !r.draft).sort((a, b) => parseDate(b.date) - parseDate(a.date));

  lists.forEach((list) => {
    const project = moduleProject(list);
    const releases = RELEASES.filter((r) => r.project === project).slice(0, Number(list.dataset.limit) || undefined);
    wear(list, project);
    list.innerHTML = releases.length
      ? releases
          .map((r) => {
            const art = r.artwork || {};
            const small = (art.srcset || []).find((s) => s.type === "image/jpeg") || art;
            return `
      <li>
        <a class="release-card" href="${escapeHTML(window.GS.projectPath(r.project, "music", r.id))}">
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
  });
})();
