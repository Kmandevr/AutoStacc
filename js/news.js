// Renders a project's news: the latest three on its home page and the full list on its news page, each linking to its
// page at /<creator>/<project>/news/<id>. Only the open project's posts (<body data-project>).
// Needs data/news.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, parseDate, fmtDate } = window.GS;
  // Drafts are placeholders, never shown.
  const project = document.body.dataset.project;
  const NEWS = (window.NEWS || []).filter((n) => !n.draft && n.project === project);

  // `full`: the news page, where items are top-level sections (h2); on home they sit under "Latest" (h3).
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

  const sorted = [...NEWS].sort((a, b) => parseDate(b.date) - parseDate(a.date));

  const latest = $("#latest-news");
  if (latest) {
    latest.innerHTML = sorted.length
      ? sorted.slice(0, 3).map((n) => newsItem(n, false)).join("")
      : `<p class="empty">No updates yet.</p>`;
  }
  const all = $("#news-list");
  if (all) {
    all.innerHTML = sorted.length
      ? sorted.map((n) => newsItem(n, true)).join("")
      : `<p class="empty">No updates yet.</p>`;
  }
})();
