// /admin/<page> (the Control Center's sub-pages: stats, daily, manage, settings): admins only, then the one Control
// Center page; everyone else, and any unknown sub-page, gets the site's 404 page (server/pages/guard.js decides).
export { guardAdminSubpage as onRequest } from "../../server/pages/guard.js";
