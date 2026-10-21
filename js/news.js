// News, a drop-in for any [data-news] element: a project's published posts (from the content API through
// js/project-content.js), newest first, each linking to its page at /<creator>/<project>/news/<id>. data-project picks
// the project (default: the open project's, <body data-project>); data-limit="3" caps the posts; data-full shows whole
// posts as top-level sections (h2, the news page) instead of headlines with summaries under a section heading (h3).
// Outside the project's pages it wears the project's look. Needs js/util.js and js/project-content.js.
(function () {
  "use strict";

  const { escapeHTML, parseDate, fmtDate, moduleProject, wear, content } = window.GS;
  const boxes = [...document.querySelectorAll("[data-news]")];
  if (!boxes.length || !content) return;

  // `full`: the news page, where items are top-level sections (h2); elsewhere they sit under a heading (h3).
  // bodyHtml is made on the server from the Studio's safe text markup (server/sites/text.js), never creator HTML.
  function newsItem(n, full) {
    const h = full ? "h2" : "h3";
    return `
      <article class="news-item"${full ? ` id="${escapeHTML(n.id)}"` : ""}>
        <div class="meta">
          <span class="tag">${escapeHTML(n.tag || "Update")}</span>
          <time datetime="${escapeHTML(n.date)}">${fmtDate(n.date)}</time>
        </div>
        <${h}><a href="${escapeHTML(content.href(n, "news"))}">${escapeHTML(n.title)}</a></${h}>
        ${full && n.bodyHtml ? `<div class="body">${n.bodyHtml}</div>` : `<p>${escapeHTML(n.summary || "")}</p>`}
      </article>`;
  }

  boxes.forEach(async (el) => {
    const project = moduleProject(el);
    const full = "full" in el.dataset;
    const posts = (await content.project(project)).news
      .filter((n) => n.project === project)
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .slice(0, Number(el.dataset.limit) || undefined);
    wear(el, project);
    el.innerHTML = posts.length ? posts.map((n) => newsItem(n, full)).join("") : `<p class="empty">No updates yet.</p>`;
    // A link to /news#<post> lands on that post once it is drawn.
    if (full && location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && el.contains(target)) target.scrollIntoView();
    }
  });
})();
