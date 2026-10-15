// The profile page of each first-party creator (data/creators.js): /<creator>, listing its published projects as
// cards, with the same card markup as the /projects directory (js/projects.js upgrades it, js/follow.js adds the follow controls).
// Creators made in the Studio get their profile from the store instead (`renderProfile` in server/sites/render.js), in the same layout.
const { abs, projectPath } = require("./data");
const H = require("./head");
const { shell, hero, clip } = require("./pages");

const { esc } = H;

// One project card (also used for the /projects directory list by scripts/build.js).
const projectCard = (x) => `<li class="project-card${x.skin ? ` look-${esc(x.id)}` : ""}"><h3><a href="${esc(projectPath(x.id))}">${x.logoFull
  ? `<img class="project-logo-full" src="/${esc(x.logoFull.src)}" width="${esc(x.logoFull.width)}" height="${esc(x.logoFull.height)}" alt="${esc(x.name)}">`
  : `${x.logo ? `<img class="project-logo" src="/${esc(x.logo)}" width="56" height="56" alt="">` : ""}${esc(x.name)}`}</a></h3><p>${esc(x.summary || "")}</p></li>`;

function creatorPage(SITE, data, c) {
  const p = "/" + c.id;
  const projects = data.projects.filter((x) => x.creator === c.id && !x.draft);
  const crumbs = [["Home", "/"], [c.name, p]];
  const title = `${c.name} · ${SITE.name}`;
  const description = clip(`${c.name} on ${SITE.name}: ${c.summary || ""} ${projects.map((x) => x.name).join(", ")}.`.replace(/\s+/g, " ").trim());
  const page = {
    path: p, title, description, index: true, ogType: "profile", image: SITE.image,
    schema: [H.webPage(SITE, { path: p, title, description }, "ProfilePage", {
      breadcrumb: H.breadcrumbs(SITE, crumbs),
      ...(projects.length ? { mainEntity: H.itemList(SITE, projects.map((x) => [x.name, projectPath(x.id)])) } : {})
    })]
  };
  const main = `${hero(crumbs, "Creator", c.name, esc(c.summary || ""))}

    <section>
      <div class="wrap">
        <div class="section-head"><h2>Projects</h2><a href="/projects">All projects on ${esc(SITE.name)} &rarr;</a></div>
        <ul class="projects" data-project-list data-creator="${esc(c.id)}">${projects.map(projectCard).join("")}</ul>
      </div>
    </section>`;
  return { file: `${c.id}.html`, page, html: shell(SITE, { page, section: "creator", styles: ["projects", "detail"], scripts: ["js/projects.js", "js/follow.js"], main }) };
}

module.exports = { creatorPage, projectCard, url: (SITE, c) => abs(SITE, "/" + c.id) };
