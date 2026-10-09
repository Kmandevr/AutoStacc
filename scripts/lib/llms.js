// Writes llms.txt: a plain-text guide to the site for AI assistants and crawlers that don't run JavaScript (the
// llmstxt.org format). Built from data/ like the sitemap, so it lists only what is published: no drafts.
const { abs, projectPath } = require("./data");

function llmsTxt(data) {
  const { SITE } = data;
  const url = (p) => abs(SITE, p);
  const projects = data.projects.filter((p) => !p.draft);
  const products = data.products.filter((p) => !p.draft);
  const money = (n, c) => `${c === "USD" ? "$" : ""}${Number(n).toFixed(2)}${c === "USD" ? "" : " " + c}`;

  const projectBlock = (x) => {
    const pages = (x.pages || []).filter((pg) => !pg.path.startsWith("#"))
      .map((pg) => `- [${pg.label}](${url(projectPath(x.id, ...(pg.path ? [pg.path] : [])))})`);
    const releases = data.releases.filter((r) => r.project === x.id)
      .map((r) => `- [${r.title}](${url(projectPath(x.id, "music", r.id))}) (${r.type.toLowerCase()}, ${r.date}): ${r.description}`);
    const sold = products.filter((p) => p.project === x.id)
      .map((p) => `- [${p.title}](${url("/shop/" + p.id)}) (${p.category}, ${money(p.price, p.currency)}): ${p.description}`);
    return [
      `### ${x.name}`, "", `> ${x.summary}`, "",
      ...pages, "",
      ...(releases.length ? ["Releases:", "", ...releases, ""] : []),
      ...(sold.length ? ["For sale on AutoStacc:", "", ...sold, ""] : [])
    ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));
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
    `- [Projects](${url("/projects")}): every project on ${SITE.name}`,
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
    ""
  ].join("\n");
}

module.exports = { llmsTxt };
