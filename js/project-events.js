// Event cards (GS.eventCard, the same card the server draws on /events and a project's events list, css/events.css)
// and a drop-in for any [data-events] element: a project's upcoming events (from the content API through
// js/project-content.js, soonest first), data-limit="3" caps them, each card linking to the event's own page, which
// carries its structured data and "Add to calendar". data-project picks the project (default: the open project's).
// Outside the project's pages it wears the project's look. Needs js/util.js, js/card.js and js/project-content.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e, fmtDate } = GS;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const today = () => new Date().toISOString().slice(0, 10);

  function country(code) {
    if (!code) return "";
    try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
  }
  const when = (x) => `<time datetime="${e(x.date)}">${e(fmtDate(x.date))}</time>${x.endDate ? ` – <time datetime="${e(x.endDate)}">${e(fmtDate(x.endDate))}</time>` : ""}${x.time ? `, ${e(x.time)}` : ""}`;

  // x: an event as the content API (or js/explore-items.js) gives it. heading: its h level; host: also name who hosts it.
  function eventCard(x, { heading = 3, host = true } = {}) {
    const [, m, d] = String(x.date).split("-");
    const href = x.href || (GS.content ? GS.content.href(x, "events") : x.path);
    const place = [x.venue, x.city, country(x.country)].filter(Boolean).join(", ");
    const tags = (x.tags || []).length ? `<ul class="tag-list" aria-label="Tags">${x.tags.map((t) => `<li>${e(t)}</li>`).join("")}</ul>` : "";
    return GS.card({ cls: `ecard ${GS.look(x.project)}`, href, title: x.title, level: heading, titleCls: "ecard-name", bodyCls: "ecard-body",
      art: `<span>${MONTHS[Number(m) - 1] || ""}</span><strong>${Number(d) || ""}</strong>`, artCls: "ecard-date",
      body: `
          <p class="ecard-when">${when(x)}</p>
          <p class="ecard-where">${e(place)}</p>
          ${host && x.projectName ? `<p class="ecard-by">by ${e(x.projectName)}</p>` : ""}
          ${tags}
          <div class="ecard-actions"><a class="btn small" href="${e(href)}">Details<span class="sr-only"> of ${e(x.title)}</span></a>${x.ticketUrl ? `<a class="btn ghost small" href="${e(x.ticketUrl)}" target="_blank" rel="noopener">Tickets<span class="sr-only"> for ${e(x.title)}</span></a>` : ""}</div>` });
  }
  const eventCards = (list, opts) => `<ul class="ecards">${list.map((x) => `<li>${eventCard(x, opts)}</li>`).join("")}</ul>`;
  GS.eventCard = eventCard;
  GS.eventCards = eventCards;

  const boxes = [...document.querySelectorAll("[data-events]")];
  if (!boxes.length || !GS.content) return;
  boxes.forEach(async (el) => {
    const id = GS.moduleProject(el);
    // Only published, upcoming events come from the API; ended ones are dropped here too, in case a page stays open.
    const upcoming = (await GS.content.project(id)).events
      .filter((x) => x.project === id && (x.endDate || x.date) >= today())
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""))
      .slice(0, Number(el.dataset.limit) || undefined);
    GS.wear(el, id);
    el.innerHTML = upcoming.length ? eventCards(upcoming, { heading: 3, host: false })
      : `<p class="empty">No upcoming events. Check back soon.</p>`;
  });
})();
