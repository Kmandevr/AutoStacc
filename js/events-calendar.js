// The events calendar at /events (server/content/calendar.js renders it; this only enhances it): arrow keys move
// between the days of the month table (Enter goes to a day's first event), and a signed-in visitor gets a Following
// filter that shows only events of the projects they follow (GET /api/events?following=1, never cached). Without
// JavaScript, or signed out, the server's page works as it is.
(() => {
  const root = document.querySelector("[data-events-calendar]");
  if (!root || !window.GS) return;
  const { api, escapeHTML: e } = window.GS;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- keyboard: one tab stop in the month, arrows between days ----------
  const grid = root.querySelector("[data-events-grid]");
  if (grid) {
    const days = [...grid.querySelectorAll("td[data-date]")];
    const start = days.find((d) => d.classList.contains("cal-today")) || days.find((d) => d.classList.contains("cal-has")) || days[0];
    days.forEach((d) => {
      d.tabIndex = d === start ? 0 : -1;
      d.setAttribute("aria-label", d.textContent.trim().replace(/\s+/g, " "));
    });
    const move = (from, to) => {
      if (!to) return;
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    };
    grid.addEventListener("keydown", (ev) => {
      const cell = ev.target.closest("td[data-date]");
      if (!cell || ev.target !== cell) return;
      const i = days.indexOf(cell);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key];
      if (step) move(cell, days[i + step]);
      else if (ev.key === "Home") move(cell, days[0]);
      else if (ev.key === "End") move(cell, days[days.length - 1]);
      else if (ev.key === "Enter" && cell.querySelector("a")) cell.querySelector("a").focus();
      else return;
      ev.preventDefault();
    });
  }

  // ---------- Following (signed in only) ----------
  const slot = root.querySelector("[data-events-following]");
  const list = root.querySelector("[data-events-list]");
  if (!slot || !list) return;
  const original = list.innerHTML;
  const sk = window.GS.skeleton; // placeholder rows while the followed events load (optional)

  const card = (x) => {
    const [, m, d] = String(x.date).split("-");
    const by = [x.projectName, x.creatorName && x.creatorName !== x.projectName ? x.creatorName : ""].filter(Boolean).join(" · ");
    const where = [x.venue, x.city, x.country].filter(Boolean).join(", ");
    return `<li><article class="ecard">
      <a class="ecard-date" href="${e(x.path)}" tabindex="-1" aria-hidden="true"><span>${MONTHS[Number(m) - 1] || ""}</span><strong>${Number(d) || ""}</strong></a>
      <div class="ecard-body">
        <h3 class="ecard-name"><a href="${e(x.path)}">${e(x.title)}</a></h3>
        <p class="ecard-when"><time datetime="${e(x.date)}">${e(x.date)}</time>${x.endDate ? ` – <time datetime="${e(x.endDate)}">${e(x.endDate)}</time>` : ""}${x.time ? `, ${e(x.time)}` : ""}</p>
        <p class="ecard-where">${e(where)}</p>
        ${by ? `<p class="ecard-by">by ${e(by)}</p>` : ""}
        <div class="ecard-actions"><a class="btn small" href="${e(x.path)}">Details<span class="sr-only"> of ${e(x.title)}</span></a></div>
      </div>
    </article></li>`;
  };

  // Hide the month's links to events of projects not followed (or show them all again).
  const markGrid = (paths) => {
    if (!grid) return;
    grid.querySelectorAll("li").forEach((li) => {
      const a = li.querySelector("a");
      li.hidden = Boolean(paths && a && !paths.has(a.getAttribute("href")));
    });
  };

  async function following(on) {
    if (!on) {
      list.innerHTML = original;
      markGrid(null);
      return;
    }
    const q = new URLSearchParams(location.search);
    q.set("following", "1");
    q.set("from", root.dataset.from);
    q.set("to", root.dataset.to);
    q.delete("view");
    q.delete("month");
    if (sk) sk.show(list, "row", 3); else list.setAttribute("aria-busy", "true");
    const res = await api(`/api/events?${q}`);
    if (sk) sk.done(list); else list.removeAttribute("aria-busy");
    if (!res.ok) {
      list.innerHTML = `<p class="msg err" role="alert">Couldn't load the events you follow. Try again.</p>`;
      return;
    }
    const events = res.data.events || [];
    list.innerHTML = events.length ? `<ul class="ecards">${events.map(card).join("")}</ul>`
      : `<p class="empty">No events from projects you follow in these dates. <a href="/explore">Find projects to follow</a>.</p>`;
    markGrid(new Set(events.map((x) => x.path)));
  }

  api("/api/account").then((res) => {
    if (!res.ok || !res.data || !res.data.user) return;
    slot.innerHTML = `<label><input type="checkbox" data-following-toggle> Only events from projects I follow</label>`;
    slot.hidden = false;
    const box = slot.querySelector("[data-following-toggle]");
    box.addEventListener("change", async () => {
      box.disabled = true;
      await following(box.checked);
      box.disabled = false;
    });
  });
})();
