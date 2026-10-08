// /settings: signed-in visitors only (server/pages/guard.js decides), then the Settings page.
export { guardSettingsPage as onRequest } from "../server/pages/guard.js";
