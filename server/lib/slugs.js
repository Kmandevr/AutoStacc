// Creator addresses: autostacc.com/<slug> is a creator's space, so a slug shares the top level with the platform's own
// pages and files. RESERVED is every top-level name the platform uses or may need; a creator can never take one.
// Read by the build (scripts/lib/platform.js refuses a creator in data/creators.js with a bad slug), by the Studio before
// a creator name is stored (server/creators/creators.js) and by the public creator pages (server/sites/public.js).
// test/unit/sites.test.js fails if a top-level page, folder or Function of the site is missing here, so adding a
// platform page can't open a hole.
export const RESERVED = new Set([
  // platform pages and the signed-in app
  "index", "home", "about", "shop", "store", "cart", "checkout", "login", "logout", "signup", "register", "account", "accounts",
  "settings", "dashboard", "library", "stacc", "your-stacc", "studio", "editor", "create", "admin", "projects", "project",
  "creators", "creator", "product", "explore", "discover", "search", "browse", "new", "featured", "trending", "pricing", "plans", "fees", "help", "support", "contact",
  "faq", "docs", "blog", "news", "music", "press", "events", "shows", "legal", "terms", "privacy", "cookies", "licence",
  "license", "licenses", "refunds", "security", "status", "jobs", "careers", "brand", "team", "partners", "developers",
  // site files and folders
  "api", "media", "css", "js", "data", "img", "images", "assets", "static", "fonts", "files", "downloads", "uploads",
  "previews", "functions", "server", "scripts", "dist", "test", "tests", "dev", "preview", "sitemap", "sitemap.xml",
  "robots.txt", "llms.txt", "favicon.ico", "404", "500", "_headers", "_redirects", "well-known", ".well-known",
  // names people would mistake for the platform itself
  "autostacc", "auto-stacc", "staff", "official", "moderator", "root", "system", "www", "mail", "email", "billing",
  "payments", "payouts", "orders", "auth", "oauth", "callback", "connect", "integrations", "webhooks", "null", "undefined"
]);

// A slug is lowercase letters, digits and single hyphens, 3 to 40 characters, and not reserved.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugProblem(slug) {
  const s = String(slug || "");
  if (s.length < 3 || s.length > 40) return "length";
  if (!SLUG.test(s)) return "format";
  if (RESERVED.has(s)) return "reserved";
  return null;
}
