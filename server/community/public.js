// The community's public pages (docs/community.md, "Rendering" and "Addresses"), run by functions/community.js and
// functions/community/[[path]].js while the community.forum switch is on:
//   /community                      spaces and the hottest threads everywhere
//   /community/<space>              a space: its channels and threads (?sort=hot|new|top, ?page=)
//   /community/<space>/<channel>    one channel
//   /community/t/<id>[-<slug>]      a thread; a missing or outdated slug redirects (301) to the current one
//   /community/sitemap.xml          every visible thread
// Answers null for anything else (the static 404). Hidden and removed threads are 404 to the public. Pages are kept
// in the edge cache for a minute in production, keyed by address; the HTML is the same for every visitor.
import { getSpaceBySlug, listSpaces, listChannels, getChannel } from "./spaces.js";
import { listThreads, getThread, listPosts, SORTS } from "./threads.js";
import { hero, threadList, spaceList, spaceAside, sortNav, threadMain, threadPath, spacePath, channelPath, esc } from "./render.js";
import { fill, headers } from "./page.js";
import { sitemap } from "./sitemap.js";
import { plain } from "./format.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THREAD = /^(thr_[a-z2-7]+)(?:-([a-z0-9-]*))?$/;
const clip = (s, n = 155) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1) > 0 ? s.lastIndexOf(" ", n - 1) : n - 1) + "…");
const redirect = (siteUrl, path) => new Response(null, { status: 301, headers: { Location: siteUrl + path, "Cache-Control": "public, max-age=300" } });

function listParams(url) {
  const sort = SORTS.includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "hot";
  const page = Math.min(Math.max(parseInt(url.searchParams.get("page"), 10) || 1, 1), 100);
  return { sort, page };
}

async function home(app, url) {
  const { sort, page } = listParams(url);
  const spaces = await listSpaces(app.db);
  const bySpace = new Map(spaces.map((s) => [s.id, s]));
  const { threads, more } = await listThreads(app.db, { sort, page });
  return {
    path: "/community", title: "Community", index: page === 1 && sort === "hot",
    description: "AutoStacc's community for music and sound: questions and answers, feedback, and the spaces of the projects and creators on AutoStacc.",
    hero: hero([["Home", "/"], ["Community", "/community"]], "AutoStacc", "Community",
      'Music and sound: ask, answer, share and talk with the people behind the projects. <a href="/community-rules">Community rules</a>.'),
    main: `<div class="cm-layout"><div class="cm-col">
        <h2>Latest</h2>${sortNav("/community", sort)}
        ${threadList(threads, { spaces: bySpace, base: "/community", sort, page, more })}
        </div><aside class="cm-aside"><p class="cm-aside-title">Spaces</p>${spaceList(spaces)}</aside></div>`
  };
}

async function space(app, url, spaceSlug, channelSlug) {
  const s = await getSpaceBySlug(app.db, spaceSlug);
  if (!s) return null;
  const channels = await listChannels(app.db, s.id);
  const channel = channelSlug ? await getChannel(app.db, s.id, channelSlug) : null;
  if (channelSlug && !channel) return null;
  const { sort, page } = listParams(url);
  const base = channel ? channelPath(s, channel) : spacePath(s);
  const { threads, more } = await listThreads(app.db, { spaceId: s.id, channelId: channel && channel.id, sort, page });
  const crumbs = [["Home", "/"], ["Community", "/community"], [s.name, spacePath(s)], ...(channel ? [[channel.name, base]] : [])];
  const title = channel ? `${channel.name} · ${s.name}` : s.name;
  return {
    path: base, title, index: page === 1 && sort === "hot",
    description: clip(s.description || `${s.name} on AutoStacc's community: questions, answers and talk about music and sound.`),
    hero: hero(crumbs, s.kind === "community" && !s.official ? "Unofficial community" : "Community", channel ? channel.name : s.name,
      s.description ? esc(s.description) : ""),
    main: `<div class="cm-layout"><div class="cm-col">${sortNav(base, sort)}
        ${threadList(threads, { base, sort, page, more, empty: "Nothing here yet." })}
        </div>${spaceAside(s, channels, channel)}</div>`
  };
}

async function thread(app, id, slug) {
  const t = await getThread(app.db, id);
  if (!t || t.state !== "visible") return null;
  if ((slug || "") !== t.slug) return { redirect: threadPath(t) };
  const [posts, spaces] = await Promise.all([listPosts(app.db, t.id), listSpaces(app.db)]);
  const s = spaces.find((x) => x.id === t.spaceId);
  if (!s) return null;
  const opening = posts[0];
  const text = opening && opening.state === "visible" ? plain(opening.body) : "";
  const url = app.config.siteUrl + threadPath(t);
  const visibleReplies = posts.slice(1).filter((p) => p.state === "visible");
  const person = (name) => ({ "@type": "Person", name: name || "deleted user" });
  const schema = t.type === "question"
    ? [{ "@type": "QAPage", url, mainEntity: { "@type": "Question", name: t.title, text: clip(text, 500), answerCount: visibleReplies.length,
        datePublished: t.createdAt, author: person(t.author),
        ...(t.acceptedPostId && visibleReplies.find((p) => p.id === t.acceptedPostId) ? { acceptedAnswer: { "@type": "Answer",
          text: clip(plain(visibleReplies.find((p) => p.id === t.acceptedPostId).body), 500), url: `${url}#${t.acceptedPostId}`, upvoteCount: visibleReplies.find((p) => p.id === t.acceptedPostId).helpful } } : {}) } }]
    : [{ "@type": "DiscussionForumPosting", url, headline: t.title, text: clip(text, 500), datePublished: t.createdAt, author: person(t.author),
        commentCount: visibleReplies.length, interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: t.score } }];
  return {
    path: threadPath(t), title: `${t.title} · ${s.name}`, index: true, schema,
    description: clip(text || t.title),
    hero: hero([["Home", "/"], ["Community", "/community"], [s.name, spacePath(s)], [t.title, threadPath(t)]], esc(s.name), t.title),
    main: `<div class="cm-layout"><div class="cm-col cm-thread-page">${threadMain(t, posts)}</div></div>`
  };
}

// The page for an address, or null. Errors are the caller's to log.
async function resolve(app, url) {
  const segs = url.pathname.replace(/\/+$/, "").split("/").slice(2);
  if (!segs.length) return home(app, url);
  if (segs.length === 1 && segs[0] === "sitemap.xml") return { xml: await sitemap(app) };
  if (segs[0] === "t" && segs.length === 2) {
    const m = segs[1].match(THREAD);
    return m ? thread(app, m[1], m[2]) : null;
  }
  if (segs.length <= 2 && segs.every((s) => SLUG.test(s))) return space(app, url, segs[0], segs[1]);
  return null;
}

// template: the /community page's HTML (a Response body string). Returns a Response or null.
export async function communityPage(app, template) {
  const { request } = app;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname !== url.pathname.toLowerCase() && !url.pathname.startsWith("/community/t/")) {
    return redirect(app.config.siteUrl, url.pathname.toLowerCase() + url.search);
  }
  // The cache key is the path plus only the parameters that change the page (sort and page, normalised), so junk
  // parameters can't skip the cache and reach the database; HEAD answers from the cache too.
  const cache = app.config.appEnv === "production" && typeof caches !== "undefined" ? caches.default : null;
  const { sort, page: n } = listParams(url);
  const keyQuery = /^\/community\/(t\/|sitemap\.xml$)/.test(url.pathname) ? "" : `?sort=${sort}&page=${n}`;
  const key = new Request(url.origin + url.pathname + keyQuery, { method: "GET" });
  const hit = cache ? await cache.match(key) : null;
  if (hit) return request.method === "HEAD" ? new Response(null, { status: hit.status, headers: hit.headers }) : hit;
  const page = await resolve(app, url);
  if (!page) return null;
  if (page.redirect) return redirect(app.config.siteUrl, page.redirect);
  let body;
  if (page.xml) body = page.xml;
  else {
    const html = await template();
    if (!html) return null;
    body = fill(html, app.config.siteUrl, page);
  }
  const res = new Response(body, { headers: page.xml ? { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600" } : headers() });
  if (cache && app.ctx && app.ctx.waitUntil) app.ctx.waitUntil(cache.put(key, res.clone()));
  return request.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
