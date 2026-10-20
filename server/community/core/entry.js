// The Pages Functions for /community and /community/* (functions/community.js, functions/community/[[path]].js).
// With the community.forum switch off, /community is the static "opening soon" page and everything under it is the
// site's ordinary 404. On, the pages come from public.js, filled into the static /community page as a template; an
// address it doesn't know, or an error, also gets the ordinary 404.
import { loadConfig } from "../../lib/config.js";
import { isOn } from "../../lib/features.js";
import { communityPage } from "./public.js";

async function notFound(context) {
  try {
    const page = await context.env.ASSETS.fetch(new URL("/404", context.request.url));
    if (page.ok) return new Response(page.body, { status: 404, headers: page.headers });
  } catch { /* fall through */ }
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function onCommunityRequest(context) {
  const atRoot = new URL(context.request.url).pathname.replace(/\/+$/, "") === "/community";
  let res = null;
  try {
    const app = { env: context.env, config: loadConfig(context.env), ctx: context, request: context.request, db: context.env.DB };
    if (!isOn(app, "community.forum")) return atRoot ? context.next() : notFound(context);
    // The template must be the generated page with its markers; anything else (an error page, a stale deploy) is a 404.
    const template = async () => {
      const page = await context.env.ASSETS.fetch(new URL("/community", context.request.url));
      const html = page.ok ? await page.text() : "";
      return /<!-- community:main:start -->/.test(html) && /<!-- seo:start/.test(html) ? html : null;
    };
    res = await communityPage(app, template);
  } catch (e) {
    console.error("community page", e && e.stack ? e.stack : e);
  }
  return res || notFound(context);
}
