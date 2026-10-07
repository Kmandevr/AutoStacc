// Renders news: the latest three on the home page and the full list on the news page.
// Needs data/news.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, parseDate, fmtDate } = window.GS;
  const NEWS = window.NEWS || [];

  function newsItem(n, full) {
    return `
      <article class="news-item">
        <div class="meta">
          <span class="tag">${escapeHTML(n.tag || "Update")}</span>
          <time datetime="${escapeHTML(n.date)}">${fmtDate(n.date)}</time>
        </div>
        <h3>${escapeHTML(n.title)}</h3>
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
