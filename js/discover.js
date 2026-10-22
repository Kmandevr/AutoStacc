// Discover (/discover; owner, 2026-10-22): creators, projects and communities, never products. Tabs are links
// (?tab=all|creators|projects|communities); this script runs before the projects and creators browsers and removes the
// panels that aren't open, so only the open tab's browser loads. All: a spotlight (the admins' picks, then a fair
// daily rotation) and rows (active this month, new on AutoStacc, one per genre, communities), each card saying what it
// is, above the built A-Z list of every creator and project (links that work without the store or JavaScript). Communities: every space's card. Needs js/util.js, js/browse-shelves.js and js/project-card.js.
(function () {
  "use strict";
  const GS = window.GS;
  const tabsEl = document.querySelector("[data-discover-tabs]");
  if (!GS || !tabsEl) return;
  const { escapeHTML: e, api } = GS;
  const TABS = ["all", "creators", "projects", "communities"];
  const want = new URLSearchParams(location.search).get("tab");
  const tab = TABS.includes(want) ? want : "all";

  tabsEl.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.querySelectorAll("[data-discover-panel]").forEach((p) => (p.dataset.discoverPanel === tab ? (p.hidden = false) : p.remove()));

  const initials = (name) => name.split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  const creatorCard = (c) => `<article class="dcard" data-kind="creator">
      <a class="dcard-art" href="${e(c.path)}" tabindex="-1" aria-hidden="true"><span>${e(initials(c.name))}</span></a>
      <p class="card-type">Creator${c.verified ? "" : " · unverified"}</p>
      <h3 class="dcard-name"><a href="${e(c.path)}">${e(c.name)}</a></h3>
      <p class="dcard-sub">${c.bio ? e(c.bio) : `${c.projects.length} project${c.projects.length === 1 ? "" : "s"}`}</p>
    </article>`;
  const spaceCard = (s) => `<article class="dcard" data-kind="community">
      <a class="dcard-art dcard-space" href="${e(s.path)}" tabindex="-1" aria-hidden="true"><span>${e(initials(s.name))}</span></a>
      <p class="card-type">Community${s.official ? " · official" : ""}</p>
      <h3 class="dcard-name"><a href="${e(s.path)}">${e(s.name)}</a></h3>
      <p class="dcard-sub">${s.description ? e(s.description) : s.kind === "project" ? "A project's own space" : "Questions, answers and talk"}</p>
    </article>`;
  const projectCard = (p) => GS.projectCard(p, { compact: true });

  // The spotlight's big slide: art, what it is, the name, one line and one link.
  const slide = (x) => {
    const path = x.path;
    const art = x.kind === "project" && x.image ? `<img src="${e(x.image)}" alt="" width="320" height="320" loading="lazy">` : `<span>${e(initials(x.name))}</span>`;
    const line = x.tagline || x.bio || x.description || "";
    return `<div class="dspot" data-kind="${e(x.kind)}"><a class="dspot-art" href="${e(path)}" tabindex="-1" aria-hidden="true">${art}</a>
      <div class="dspot-body"><p class="card-type">${e({ project: "Project", creator: "Creator", community: "Community" }[x.kind])}</p>
        <h2 class="dspot-name">${e(x.name)}</h2>${line ? `<p>${e(line)}</p>` : ""}
        <a class="btn" href="${e(path)}">Visit<span class="sr-only"> ${e(x.name)}</span></a></div></div>`;
  };

  async function all(box) {
    const S = GS.shelves;
    if (GS.skeleton) GS.skeleton.show(box, "card", 4);
    const [pr, cr, sp, picks] = await Promise.all([api("/api/projects/browse?sort=active"), api("/api/creators?sort=newest"), api("/api/community/spaces"), S.picks("discover")]);
    if (GS.skeleton) GS.skeleton.done(box);
    const projects = pr.ok ? pr.data.projects : [];
    const creators = cr.ok ? cr.data.creators : [];
    const spaces = sp.ok ? sp.data.spaces : [];
    // Offline: the A-Z list below (built into the page) stays the way in.
    if (!projects.length && !creators.length) { box.innerHTML = `<p class="msg">Discover can't reach the store right now; everyone on AutoStacc is listed below.</p>`; return; }
    const pool = [...projects.map((p) => ({ ...p, kind: "project" })), ...creators.map((c) => ({ ...c, kind: "creator", id: c.slug })), ...spaces.map((s) => ({ ...s, kind: "community" }))];
    const spot = S.rotate(pool, picks, 5, (x) => `${x.kind}:${x.id}`);
    const DAY = 86400000;
    const recent = (iso) => iso && Date.now() - Date.parse(iso) < 30 * DAY;
    const genres = new Map();
    projects.forEach((p) => p.genres.forEach((g) => { if (!genres.has(g.label)) genres.set(g.label, []); genres.get(g.label).push(p); }));
    const rows = [
      S.row({ title: "Active this month", id: "active", items: projects.filter((p) => recent(p.lastActive) || p.nextEvent), render: projectCard, seeAll: "/discover?tab=projects&active=1" }),
      S.row({ title: "New on AutoStacc", id: "new", items: [...projects].filter((p) => recent(p.createdAt)), render: projectCard }),
      S.row({ title: "Creators", id: "creators", items: creators, render: creatorCard, seeAll: "/discover?tab=creators" }),
      ...[...genres].map(([g, list]) => S.row({ title: g, items: list, render: projectCard })),
      S.row({ title: "Communities", id: "spaces", items: spaces, render: spaceCard, seeAll: "/discover?tab=communities" })
    ].filter(Boolean);
    // Few creators yet: rows wait for 4 items each, so the page leads with the spotlight and an invitation (owner).
    const invite = `<section class="dinvite panel"><p class="card-type">Creators</p><h2>Make something? Put it here.</h2>
      <p>Claim your creator name and build free pages for your projects in the Studio, no code needed.</p><a class="btn" href="/studio">Become a creator</a></section>`;
    box.innerHTML = S.spotlight(spot, slide, { label: "Spotlight" }) + (rows.length ? rows.join("") : "") + (rows.length < 2 ? invite : "");
    window.dispatchEvent(new Event("gs:cards"));
  }

  async function communities(box) {
    if (GS.skeleton) GS.skeleton.show(box, "card", 4);
    const r = await api("/api/community/spaces");
    if (GS.skeleton) GS.skeleton.done(box);
    if (!r.ok) { box.innerHTML = `<p class="msg">The community isn't reachable right now. <a href="/community">Open the community</a>.</p>`; return; }
    box.innerHTML = r.data.spaces.length ? `<div class="dgrid">${r.data.spaces.map(spaceCard).join("")}</div>` : `<p class="msg">No communities yet. <a href="/community">Start in the community</a>.</p>`;
  }

  const allBox = document.querySelector("[data-discover-all]");
  if (allBox) all(allBox);
  const spaceBox = document.querySelector("[data-discover-communities]");
  if (spaceBox) communities(spaceBox);
})();
