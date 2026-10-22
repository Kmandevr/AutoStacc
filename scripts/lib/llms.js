// Writes llms.txt: a plain-text guide to the site for AI assistants and crawlers that don't run JavaScript (the
// llmstxt.org format). Built from data/ like the sitemap, so it lists only what is published: no drafts. Products,
// releases and events are Studio content in the store database, so it points at the sitemaps the store API serves.
const { abs, projectPath } = require("./data");

function llmsTxt(data) {
  const { SITE } = data;
  const url = (p) => abs(SITE, p);
  const projects = data.projects.filter((p) => !p.draft);

  const projectBlock = (x) => {
    const pages = (x.pages || []).filter((pg) => !pg.path.startsWith("#"))
      .map((pg) => `- [${pg.label}](${url(projectPath(x.id, ...(pg.path ? [pg.path] : [])))})`);
    return [`### ${x.name}`, "", `> ${x.summary}`, "", ...pages, ""];
  };

  return [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} is the site at ${SITE.url}: a store for music, samples, presets, stems and visuals, straight from the projects (artists and creators) that make them. ${SITE.name} sells and delivers them, and keeps what each customer owns in their account. A project is never the site; each one has its own pages under ${url("/<creator>/<project>")}.`,
    "",
    "## Platform",
    "",
    `- [Home](${url("/")}): new releases, projects and how ${SITE.name} works`,
    `- [Store](${url("/shop")}): digital downloads, delivered right after checkout (payments by Stripe)`,
    `- [About](${url("/about")}): how ${SITE.name} works and what its words mean`,
    `- [Discover](${url("/discover")}): every creator, project and community on ${SITE.name}`,
    `- [Events](${url("/events")}): a calendar of what projects have coming up, where and when`,
    `- [Guides](${url("/guide")}): step-by-step help for buying, Your Stacc and refunds, and the creator manual for the Studio, selling, packs and payouts`,
    "",
    "## Words",
    "",
    "- Your Stacc: a customer's library of everything they own, from every project.",
    "- Stacclet: a collection of related Pacs from one project.",
    "- Pac: a folder of content (MIDI, samples, loops, presets and more).",
    "- Auto-Stacc: adds a followed project's free releases to Your Stacc automatically; paid content is never added without buying it.",
    "",
    "## Projects",
    "",
    ...projects.flatMap(projectBlock),
    "## Optional",
    "",
    `- [Sitemap](${url("/sitemap.xml")})`,
    `- [Releases and events sitemap](${url("/sitemap-content.xml")}): every release and event page projects publish`,
    `- [Store sitemap](${url("/sitemap-shop.xml")}): the product pages of trusted creators`,
    ""
  ].join("\n");
}

module.exports = { llmsTxt };
