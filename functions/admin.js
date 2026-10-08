// /admin (the Control Center): admins only; everyone else gets the site's 404 page (server/pages/guard.js decides).
export { guardAdminPage as onRequest } from "../server/pages/guard.js";
