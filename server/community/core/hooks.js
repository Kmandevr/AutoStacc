// How features plug into the community's core (docs/community.md, "Built as independent features"). The core never
// imports a feature: features register a manifest here (server/community/features/index.js is the one list), and the
// core calls these hooks, which only reach features whose switches are on. A manifest may have:
//   name, switch               the feature's own switch in server/lib/features.js ("community.<name>")
//   routes                     [[method, path, handler]]: 404 while the feature (or the whole community) is off
//   checks: { action(app, ctx) }   run before a core write; throw (fail()) to refuse it. Actions: "post" (a take or reply)
//   on: { event(app, payload) }    after a core write; errors are logged, never undo the write. Events: threadStarted,
//                                  replyPosted, postEdited, postRemoved
//   slots: { name(ctx) }       HTML for named places on the server-rendered pages (strings, already escaped by the
//                              feature). Slots: nameMark, postBadges, postClass, postFooter, threadTools, listBadges,
//                              listMeters, spaceHeader, homeBoxes
//   format: { links: [fn], blocks: [rule] }   formatter extensions (format.js)
//   state: { thread(app, user, thread) }   what the visitor has done in a take, merged into GET .../mine under the name
//   arrange: { replies(thread, replies) }  reorders a take's top-level replies (the last feature to answer wins)
//   schema: { thread(ctx, entity) }        adds fields to a take's JSON-LD entity (ctx: thread, posts, url)
//   erase(db, userId) -> statements, exportData(db, userId) -> object   for account deletion and the data download
import { isOn } from "../../lib/features.js";
import { fail } from "../../lib/http.js";

const features = [];

export function register(manifest) {
  if (!manifest || !manifest.name || !manifest.switch) throw new Error("a community feature needs a name and a switch");
  if (features.some((f) => f.name === manifest.name)) throw new Error(`community feature ${manifest.name} registered twice`);
  features.push(manifest);
}

export const communityOn = (app) => isOn(app, "community.forum");
const on = (app) => (communityOn(app) ? features.filter((f) => isOn(app, f.switch)) : []);
export const featureOn = (app, name) => on(app).some((f) => f.name === name);
// The switched-on features' names, so the browser's feature scripts know whether to do anything.
export const featuresOn = (app) => on(app).map((f) => f.name);

export async function check(app, action, ctx) {
  for (const f of on(app)) if (f.checks && f.checks[action]) await f.checks[action](app, ctx);
}

export async function emit(app, event, payload) {
  for (const f of on(app)) {
    if (!f.on || !f.on[event]) continue;
    try { await f.on[event](app, payload); } catch (e) { console.error(`community ${f.name} ${event}`, e && e.stack ? e.stack : e); }
  }
}

export const slot = (app, name, ctx) => on(app).map((f) => (f.slots && f.slots[name] ? f.slots[name](ctx) || "" : "")).join("");

export function formatExtensions(app) {
  const ext = { links: [], blocks: [] };
  for (const f of on(app)) if (f.format) { ext.links.push(...(f.format.links || [])); ext.blocks.push(...(f.format.blocks || [])); }
  return ext;
}

export async function state(app, user, thread) {
  const out = {};
  for (const f of on(app)) if (f.state && f.state.thread) out[f.name] = await f.state.thread(app, user, thread);
  return out;
}

export function arrange(app, thread, replies) {
  let list = replies;
  for (const f of on(app)) if (f.arrange && f.arrange.replies) list = f.arrange.replies(thread, list);
  return list;
}

export function schema(app, ctx, entity) {
  for (const f of on(app)) if (f.schema && f.schema.thread) f.schema.thread(ctx, entity);
  return entity;
}

// What a renderer needs from the hooks, so render code stays free of app and feature lookups.
export const renderKit = (app) => ({ slot: (name, ctx) => slot(app, name, ctx), arrange: (t, r) => arrange(app, t, r), format: formatExtensions(app) });

// Every feature's routes, each refusing with 404 while its feature or the community is off.
export const featureRoutes = () => features.flatMap((f) => (f.routes || []).map(([method, path, handler, opts]) => [method, path, async (app, params) => {
  if (!communityOn(app) || !isOn(app, f.switch)) fail(404, "not_found", "Not found.");
  return handler(app, params);
}, opts]));

// Deletion and export reach every feature, switched on or not, since their data outlives a switch.
export const eraseStmts = (db, userId) => features.flatMap((f) => (f.erase ? f.erase(db, userId) : []));
export async function exportData(db, userId) {
  const out = {};
  for (const f of features) if (f.exportData) out[f.name] = await f.exportData(db, userId);
  return out;
}
