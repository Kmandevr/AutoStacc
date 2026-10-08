// Server-side gate for the account pages (/dashboard, /account, /settings), run by their Pages Functions before the
// static page is served. Without a signed-in session (or when the store can't check one) the answer is a redirect to
// /login?next=<that page>, so a signed-out visitor never receives the app at all. Signed in, the static page is
// served marked no-store, so no shared or back/forward cache replays it after sign-out. The pages hold no private data
// themselves: it comes only from the API, which checks the session again on every request. This gate is the first
// line, not the only one. /library isn't gated here: guests open it with the key in their receipt link (#key=..., which
// never reaches the server) and the library API decides what they may see.
import { loadConfig } from "../lib/config.js";
import { currentUser } from "../auth/session.js";

export const GATED = new Set(["/dashboard", "/account", "/settings"]);
const HOME = "/dashboard";

// The same test the login page uses (GET /api/account has a user), so the gate and login never disagree and bounce
// a visitor between them.
async function signedIn(context) {
  try {
    const app = { env: context.env, config: loadConfig(context.env), ctx: context, request: context.request, db: context.env.DB };
    return Boolean(await currentUser(app));
  } catch {
    return false;
  }
}

// Where to come back to after logging in: this page and its query, never anything else (no open redirects).
export function loginRedirect(url) {
  const path = url.pathname.replace(/(.)\/+$/, "$1");
  const page = GATED.has(path) ? path + url.search : HOME;
  return `/login?next=${encodeURIComponent(page)}`;
}

export async function guardPage(context) {
  const url = new URL(context.request.url);
  if (!(await signedIn(context))) {
    return new Response(null, { status: 302, headers: { Location: loginRedirect(url), "Cache-Control": "no-store" } });
  }
  const page = await context.next();
  const res = new Response(page.body, page);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
