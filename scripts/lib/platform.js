// The platform layer's integrity checks and hierarchy (docs/architecture.md): every creator, project, Stacclet, Pac,
// product, poll and relationship link must point at something that exists, creators have valid
// unreserved addresses, and products may only sell their own project's Pacs. Pure functions over loadData() output;
// build.js fails on any error returned here.
const { slugProblem } = require("../../server/lib/slugs.js");
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const byId = (list) => new Map(list.map((x) => [x.id, x]));
const uses = (project, feature) => Boolean(project && (project.features || []).includes(feature));

// Project of a Pac, through its Stacclet. Undefined if any link is missing.
function pacProject(data, pacId) {
  const pac = byId(data.pacs).get(pacId);
  const stacclet = pac && byId(data.stacclets).get(pac.stacclet);
  return stacclet && stacclet.project;
}

// "kind:id" → the record, or undefined. Releases are Studio content in the store database, not in data/, so a
// "release:<slug>" reference can't be checked here and never resolves.
function resolveRef(data, ref) {
  const [kind, id] = String(ref).split(":");
  const lists = { product: data.products, stacclet: data.stacclets, pac: data.pacs, poll: data.polls };
  return lists[kind] ? lists[kind].find((x) => x.id === id) : undefined;
}

// The project a referenced thing belongs to.
function refProject(data, ref) {
  const [kind] = String(ref).split(":");
  const item = resolveRef(data, ref);
  if (!item) return undefined;
  return kind === "pac" ? pacProject(data, item.id) : item.project;
}

const releaseRef = (ref) => (String(ref).startsWith("release:") ? " (releases are made in the Studio now; data/ can't link to them)" : "");

function validate(data) {
  const errors = [];
  const projects = byId(data.projects);
  const stacclets = byId(data.stacclets);
  const pacs = byId(data.pacs);
  const unique = (list, what) => {
    const seen = new Set();
    for (const x of list) {
      if (!ID.test(x.id || "")) errors.push(`${what} "${x.id}": id must be lowercase-hyphenated`);
      if (seen.has(x.id)) errors.push(`${what} "${x.id}": duplicate id`);
      seen.add(x.id);
    }
  };
  unique(data.creators, "creator");
  unique(data.projects, "project");
  unique(data.stacclets, "stacclet");
  unique(data.pacs, "pac");
  unique(data.polls, "poll");

  // A creator's address is /<id>: never a platform word (server/lib/slugs.js) unless it is AutoStacc's own (firstParty).
  // Its projects live at /<creator>/<project>.
  const creators = byId(data.creators);
  const SLUG_PROBLEMS = { length: "must be 3 to 40 characters", format: "must be lowercase-hyphenated", reserved: "is a reserved platform address (server/lib/slugs.js)" };
  for (const c of data.creators) {
    const problem = slugProblem(c.id);
    if (problem && !(problem === "reserved" && c.firstParty === true)) errors.push(`creator ${c.id}: id ${SLUG_PROBLEMS[problem]}`);
    // A first-party creator's name must be reserved (and deployed) before it is added, or a Studio account could take
    // it first and the deploy's sync would stop on the clash.
    if (c.firstParty === true && problem !== "reserved") errors.push(`creator ${c.id}: add "${c.id}" to RESERVED in server/lib/slugs.js and deploy that first`);
    if (!c.name) errors.push(`creator ${c.id}: add a name`);
    if (!c.firstParty) errors.push(`creator ${c.id}: creators in data/creators.js are first-party (firstParty: true); others sign up in the Studio`);
  }

  const FEATURES = ["releases", "news", "shows", "store", "polls", "relationships"];
  for (const p of data.projects) {
    if (!p.name) errors.push(`project ${p.id}: add a name`);
    if (!p.creator) errors.push(`project ${p.id}: add creator (an id in data/creators.js)`);
    else if (!creators.has(p.creator)) errors.push(`project ${p.id}: creator "${p.creator}" is not in data/creators.js`);
    else if (!p.draft && creators.get(p.creator).draft) errors.push(`project ${p.id}: a published project can't belong to the draft creator "${p.creator}"`);
    for (const f of p.features || []) if (!FEATURES.includes(f)) errors.push(`project ${p.id}: unknown feature "${f}"`);
    if (p.pages !== undefined && (!Array.isArray(p.pages) || p.pages.some((x) => !x.label || typeof x.path !== "string" || !/^(#[\w-]+|[a-z0-9-]*)$/.test(x.path))))
      errors.push(`project ${p.id}: pages must be [{ label, path }] with path "", a page name like "music" or an anchor like "#shows"`);
  }
  const needProject = (what, x, required) => {
    if (!x.project) { if (required) errors.push(`${what} ${x.id}: add project (an id in data/projects.js)`); return; }
    if (!projects.has(x.project)) errors.push(`${what} ${x.id}: project "${x.project}" is not in data/projects.js`);
  };
  for (const s of data.stacclets) needProject("stacclet", s, true);
  for (const p of data.pacs) if (!stacclets.has(p.stacclet)) errors.push(`pac ${p.id}: stacclet "${p.stacclet}" is not in data/stacclets.js`);

  for (const x of data.products) {
    needProject("product", x, true);
    if (x.pacs !== undefined && !Array.isArray(x.pacs)) { errors.push(`product ${x.id}: pacs must be a list of Pac ids`); continue; }
    for (const id of x.pacs || []) {
      const pac = pacs.get(id);
      if (!pac) errors.push(`product ${x.id}: pac "${id}" is not in data/pacs.js`);
      else if (pacProject(data, id) !== x.project) errors.push(`product ${x.id}: pac "${id}" belongs to another project`);
      else if (!x.draft && pac.draft) errors.push(`product ${x.id}: a published product can't sell the draft pac "${id}"`);
    }
  }

  for (const poll of data.polls) {
    needProject("poll", poll, true);
    if (poll.project && projects.has(poll.project) && !uses(projects.get(poll.project), "polls")) errors.push(`poll ${poll.id}: project "${poll.project}" doesn't use polls (features)`);
    if (!poll.question) errors.push(`poll ${poll.id}: add a question`);
    const opts = poll.options || [];
    if (opts.length < 2) errors.push(`poll ${poll.id}: needs at least two options`);
    if (new Set(opts.map((o) => o.id)).size !== opts.length || opts.some((o) => !ID.test(o.id || "") || !o.label)) errors.push(`poll ${poll.id}: options need unique lowercase-hyphenated ids and labels`);
    for (const d of ["opens", "closes"]) if (poll[d] && !/^\d{4}-\d\d-\d\d$/.test(poll[d])) errors.push(`poll ${poll.id}: ${d} must be YYYY-MM-DD`);
    if (poll.about && !resolveRef(data, poll.about)) errors.push(`poll ${poll.id}: about "${poll.about}" doesn't exist${releaseRef(poll.about)}`);
  }

  for (const r of data.relationships) {
    const label = `relationship ${r.from} ${r.type} ${r.to}`;
    if (!data.relationshipTypes[r.type]) errors.push(`${label}: type is not in RELATIONSHIP_TYPES`);
    for (const end of [r.from, r.to]) {
      if (!resolveRef(data, end)) { errors.push(`${label}: "${end}" doesn't exist${releaseRef(end)}`); continue; }
      const project = projects.get(refProject(data, end));
      if (!uses(project, "relationships")) errors.push(`${label}: the project of "${end}" doesn't use relationships (features)`);
    }
    if (r.from === r.to) errors.push(`${label}: links to itself`);
  }
  return errors;
}

module.exports = { validate, pacProject, resolveRef, refProject, uses };
