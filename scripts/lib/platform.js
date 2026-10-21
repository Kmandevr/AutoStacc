// The platform layer's integrity checks over data/ (docs/architecture.md): every creator, project, poll and relationship
// link must point at something that exists, and creators have valid unreserved addresses. Products, Stacclets and Pacs
// are Studio content in the store database, checked by the API. Pure functions over loadData() output; build.js fails
// on any error returned here.
const { slugProblem } = require("../../server/lib/slugs.js");
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const byId = (list) => new Map(list.map((x) => [x.id, x]));
const uses = (project, feature) => Boolean(project && (project.features || []).includes(feature));

// "kind:id" -> the record, or undefined. Only polls live in data/: products, Stacclets, Pacs and releases are Studio
// content in the store database, so a reference to one can't be checked here and never resolves.
function resolveRef(data, ref) {
  const [kind, id] = String(ref).split(":");
  const lists = { poll: data.polls };
  return lists[kind] ? lists[kind].find((x) => x.id === id) : undefined;
}

// The project a referenced thing belongs to.
const refProject = (data, ref) => (resolveRef(data, ref) || {}).project;

const STUDIO_KINDS = ["release", "product", "stacclet", "pac"];
const studioRef = (ref) => (STUDIO_KINDS.includes(String(ref).split(":")[0]) ? " (it is made in the Studio now; data/ can't link to it)" : "");

function validate(data) {
  const errors = [];
  const projects = byId(data.projects);
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

  const FEATURES = ["releases", "events", "store", "polls", "relationships"];
  for (const p of data.projects) {
    if (!p.name) errors.push(`project ${p.id}: add a name`);
    if (!p.creator) errors.push(`project ${p.id}: add creator (an id in data/creators.js)`);
    else if (!creators.has(p.creator)) errors.push(`project ${p.id}: creator "${p.creator}" is not in data/creators.js`);
    else if (!p.draft && creators.get(p.creator).draft) errors.push(`project ${p.id}: a published project can't belong to the draft creator "${p.creator}"`);
    for (const f of p.features || []) if (!FEATURES.includes(f)) errors.push(`project ${p.id}: unknown feature "${f}"`);
    if (p.pages !== undefined && (!Array.isArray(p.pages) || p.pages.some((x) => !x.label || typeof x.path !== "string" || !/^(#[\w-]+|[a-z0-9-]*)$/.test(x.path))))
      errors.push(`project ${p.id}: pages must be [{ label, path }] with path "", a page name like "music" or an anchor like "#about"`);
  }
  const needProject = (what, x, required) => {
    if (!x.project) { if (required) errors.push(`${what} ${x.id}: add project (an id in data/projects.js)`); return; }
    if (!projects.has(x.project)) errors.push(`${what} ${x.id}: project "${x.project}" is not in data/projects.js`);
  };
  for (const poll of data.polls) {
    needProject("poll", poll, true);
    if (poll.project && projects.has(poll.project) && !uses(projects.get(poll.project), "polls")) errors.push(`poll ${poll.id}: project "${poll.project}" doesn't use polls (features)`);
    if (!poll.question) errors.push(`poll ${poll.id}: add a question`);
    const opts = poll.options || [];
    if (opts.length < 2) errors.push(`poll ${poll.id}: needs at least two options`);
    if (new Set(opts.map((o) => o.id)).size !== opts.length || opts.some((o) => !ID.test(o.id || "") || !o.label)) errors.push(`poll ${poll.id}: options need unique lowercase-hyphenated ids and labels`);
    for (const d of ["opens", "closes"]) if (poll[d] && !/^\d{4}-\d\d-\d\d$/.test(poll[d])) errors.push(`poll ${poll.id}: ${d} must be YYYY-MM-DD`);
    if (poll.about && !resolveRef(data, poll.about)) errors.push(`poll ${poll.id}: about "${poll.about}" doesn't exist${studioRef(poll.about)}`);
  }

  for (const r of data.relationships) {
    const label = `relationship ${r.from} ${r.type} ${r.to}`;
    if (!data.relationshipTypes[r.type]) errors.push(`${label}: type is not in RELATIONSHIP_TYPES`);
    for (const end of [r.from, r.to]) {
      if (!resolveRef(data, end)) { errors.push(`${label}: "${end}" doesn't exist${studioRef(end)}`); continue; }
      const project = projects.get(refProject(data, end));
      if (!uses(project, "relationships")) errors.push(`${label}: the project of "${end}" doesn't use relationships (features)`);
    }
    if (r.from === r.to) errors.push(`${label}: links to itself`);
  }
  return errors;
}

module.exports = { validate, resolveRef, refProject, uses };
