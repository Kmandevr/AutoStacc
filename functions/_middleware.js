// Runs before every Pages Function route. Only / is handled here: the public home page, or for a signed-in visitor
// their own home (server/pages/guard.js guardHome). Pages serves a root index.html before functions/index.js would
// run, so the home page needs the middleware; every other address passes straight through.
import { guardHome } from "../server/pages/guard.js";

export async function onRequest(context) {
  if (new URL(context.request.url).pathname === "/") return guardHome(context);
  return context.next();
}
