// Releases, a drop-in for any [data-releases] list: a card per published release of a project (from the content API
// through js/project-content.js, newest first), each linking to its page. data-project picks the project (default: the
// open project's); data-limit caps the cards. Outside the project's pages it wears the project's look. Needs
// data/projects.js, js/util.js and js/project-content.js; js/skeleton.js draws placeholder cards while they load.
(function () {
  "use strict";

  const { escapeHTML, parseDate, fmtDate, moduleProject, wear, content, skeleton: sk } = window.GS;
  const lists = [...document.querySelectorAll("[data-releases]")];
  if (!lists.length || !content) return;

  lists.forEach(async (list) => {
    const project = moduleProject(list);
    if (sk) sk.show(list, "card", Number(list.dataset.limit) || 3);
    const releases = (await content.project(project)).releases
      .filter((r) => r.project === project)
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .slice(0, Number(list.dataset.limit) || undefined);
    wear(list, project);
    if (sk) sk.done(list);
    list.innerHTML = releases.length
      ? releases
          .map((r) => {
            const art = r.artwork || {};
            const small = (art.srcset || []).find((s) => s.type === "image/jpeg") || art;
            const src = content.art(small.src);
            return `
      <li>
        <a class="release-card" href="${escapeHTML(content.href(r, "music"))}">
          ${src ? `<img src="${escapeHTML(src)}" width="${Number(art.width) || ""}" height="${Number(art.height) || ""}" alt="${escapeHTML(art.alt || "")}" loading="lazy" decoding="async">` : ""}
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
