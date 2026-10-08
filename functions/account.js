// /account: signed-in visitors only (server/pages/guard.js decides), then the static page.
export { guardPage as onRequest } from "../server/pages/guard.js";
