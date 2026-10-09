// News, a drop-in for any [data-news] element: a project's posts, newest first, each linking to its page at
// /<creator>/<project>/news/<id>. data-project picks the project (default: the open project's, <body data-project>);
// data-limit="3" caps the posts; data-full shows whole posts as top-level sections (h2, the news page) instead of
// headlines with summaries under a section heading (h3). Outside the project's pages it wears the project's look.
// Needs data/news.js and js/util.js.
(function () {
  "use strict";

  const { escapeHTML, parseDate, fmtDate, moduleProject, wear } = window.GS;
  const boxes = [...document.querySelectorAll("[data-news]")];
  if (!boxes.length) return;
  // Drafts are placeholders, never shown.
  const NEWS = (window.NEWS || []).filter((n) => !n.draft).sort((a, b) => parseDate(b.date) - parseDate(a.date));

  // `full`: the news page, where items are top-level sections (h2); elsewhere they sit under a heading (h3).
  function newsItem(n, full) {
    const h = full ? "h2" : "h3";
    return `
      <article class="news-item"${full ? ` id="${escapeHTML(n.id)}"` : ""}>
        <div class="meta">
          <span class="tag">${escapeHTML(n.tag || "Update")}</span>
          <time datetime="${escapeHTML(n.date)}">${fmtDate(n.date)}</time>
        </div>
        <${h}><a href="${escapeHTML(window.GS.projectPath(n.project, "news", n.id))}">${escapeHTML(n.title)}</a></${h}>
        ${full && n.body ? `<div class="body">${n.body}</div>` : `<p>${escapeHTML(n.summary || "")}</p>`}
      </article>`;
  }

  boxes.forEach((el) => {
    const project = moduleProject(el);
    const full = "full" in el.dataset;
    const posts = NEWS.filter((n) => n.project === project).slice(0, Number(el.dataset.limit) || undefined);
    wear(el, project);
    el.innerHTML = posts.length ? posts.map((n) => newsItem(n, full)).join("") : `<p class="empty">No updates yet.</p>`;
  });
})();
