// Clearing the edge cache after a write (docs/community.md, "Rendering"): the thread's page, its space's and channel's
// lists, the community home and the sitemap, in the keys server/community/public.js caches under (path, plus the
// normalised sort and page 1 for lists). Production only, like the cache; one data centre per purge, so pages elsewhere
// can lag by their one-minute cache.
import { spacePath, channelPath, threadPath } from "./render.js";
import { SORTS } from "./threads.js";

export function purge(app, { thread = null, space = null, channel = null } = {}) {
  if (app.config.appEnv !== "production" || typeof caches === "undefined") return;
  const base = app.config.siteUrl;
  const lists = ["/community", space && spacePath(space), space && channel && channelPath(space, channel)].filter(Boolean);
  const keys = [...lists.flatMap((p) => SORTS.map((s) => `${base}${p}?sort=${s}&page=1`)), `${base}/community/sitemap.xml`,
    ...(thread ? [base + threadPath(thread)] : [])];
  const work = Promise.all(keys.map((k) => caches.default.delete(new Request(k)))).catch((e) => console.error("community purge", e));
  if (app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(work);
}
