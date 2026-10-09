// Shared helpers. Every page loads this first; other scripts read from window.GS.
const GS = (function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const money = (n) => "$" + Number(n).toFixed(2);

  // Dates are written as YYYY-MM-DD; parse as local time so they don't shift a day.
  const parseDate = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = (s, opts = { month: "short", day: "numeric", year: "numeric" }) =>
    parseDate(s).toLocaleDateString("en-US", opts);

  // A link counts as set unless it is empty, not a web address, or just a platform's own home page
  // (the placeholders in data/). Profiles on their own subdomain, like name.bandcamp.com, count as set.
  const PLATFORM_HOMES = ["soundcloud.com", "open.spotify.com", "spotify.com", "instagram.com", "tiktok.com", "youtube.com",
    "bandcamp.com", "music.apple.com", "beatport.com", "facebook.com", "x.com", "twitter.com"];
  const isSet = (url) => {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return false;
      const home = u.pathname.replace(/\/+$/, "") === "" && !u.search;
      return !(home && PLATFORM_HOMES.includes(u.hostname.replace(/^www\./, "")));
    } catch {
      return false;
    }
  };

  // Adds structured data (schema.org JSON-LD) for search engines.
  const jsonLd = (data) => {
    const tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.textContent = JSON.stringify(data);
    document.head.append(tag);
  };

  // Prices from the store API come in cents.
  const cents = (n, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);

  // Store errors are { error: { code, message } }; account (Better Auth) errors are { code, message }.
  const apiError = (status, data) =>
    data.error || (data.message ? { code: data.code || "http_" + status, message: data.message } : { code: "http_" + status, message: status >= 500 ? "The store hit a problem on its side. Nothing was charged or lost; try again in a moment." : "That didn't work. Reload the page and try again." });

  // Calls the store API (/api/...). Never throws: returns { ok, status, data, error }. status 0 = network failure or timeout.
  const api = async (path, { method = "GET", body, headers = {}, timeout = 15000 } = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: { Accept: "application/json", ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal
      });
      // No JSON at all means no store API behind this site (a static-only deploy): same as the store being offline.
      if (!/json/.test(res.headers.get("content-type") || "")) return { ok: false, status: 503, data: {}, error: { code: "store_offline", message: "The store is offline for maintenance." } };
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data, error: res.ok ? null : apiError(res.status, data) };
    } catch {
      return { ok: false, status: 0, data: {}, error: { code: "network", message: "Couldn't connect. Check your connection and try again." } };
    } finally {
      clearTimeout(timer);
    }
  };

  // The cart lives in this browser (product ids and quantities only; the server prices it). Changes fire "gs:cart".
  const CART_KEY = "gs:cart";
  const cart = {
    items() {
      try {
        const list = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
        return Array.isArray(list) ? list.filter((i) => i && typeof i.productId === "string" && Number.isInteger(i.quantity) && i.quantity > 0) : [];
      } catch {
        return [];
      }
    },
    save(list) {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(list));
      } catch {}
      dispatchEvent(new CustomEvent("gs:cart", { detail: { count: list.length } }));
    },
    has: (id) => cart.items().some((i) => i.productId === id),
    add(id, quantity = 1) {
      if (!cart.has(id)) cart.save([...cart.items(), { productId: id, quantity }]);
    },
    setQuantity: (id, quantity) => cart.save(cart.items().map((i) => (i.productId === id ? { ...i, quantity } : i))),
    remove: (id) => cart.save(cart.items().filter((i) => i.productId !== id)),
    clear: () => cart.save([]),
    count: () => cart.items().length
  };

  // Where to go after logging in: a path on this site only (never //other.host, a full URL or javascript:), with no
  // "." or ".." segments (%2e counts as a dot), and never the login page itself (a signed-in visitor would bounce);
  // anything else gets the fallback.
  const safeNext = (raw, fallback = "/dashboard") =>
    /^\/(?!\/)[\w\-/?=&.%#]*$/.test(raw || "") && !/\/(?:\.|%2e){1,2}(?=[/?#]|$)/i.test(raw.split(/[?#]/)[0]) && !/^\/login(?:[/?#.]|$)/.test(raw) ? raw : fallback;
  // The login page, returning to `next` afterwards; mode "signup" opens Create account.
  const loginPath = (next, mode = "") => `/login?next=${encodeURIComponent(next)}${mode ? "#" + mode : ""}`;

  // Privacy-friendly analytics: an event name and a product/release id, counted per day on the server. Skipped when
  // the browser asks not to be tracked. Never blocks or breaks the page.
  const track = (event, subject = "") => {
    try {
      if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") return;
      const body = new Blob([JSON.stringify({ event, subject })], { type: "application/json" });
      if (!(navigator.sendBeacon && navigator.sendBeacon("/api/events", body))) {
        fetch("/api/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
      }
    } catch {}
  };

  // A project's pages live in its creator's space (data/projects.js `creator`): /<creator>/<id>, so
  // projectPath("x", "music", "hail") -> "/<creator of x>/x/music/hail". The same rule as scripts/lib/data.js projectPath.
  const projectPath = (id, ...rest) => {
    const p = (window.PROJECTS || []).find((x) => x.id === id) || {};
    const base = p.creator ? [p.creator, id] : ["projects", id];
    return "/" + [...base, ...rest].filter((x) => x !== "" && x !== undefined).join("/");
  };

  // The project whose page this is (<body data-project>, an entry of data/projects.js), or {} on platform pages.
  const currentProject = () => (window.PROJECTS || []).find((p) => p.id === document.body.dataset.project) || {};

  // Frame pieces shared by js/layout.js (platform pages) and js/project-frame.js (a project's pages).
  // A "Skip to content" link for keyboard users that focuses the page's <main> (returned, or null if there is none).
  const skipLink = () => {
    const main = $("main");
    if (!main) return null;
    main.id = main.id || "main";
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#${main.id}">Skip to content</a>`);
    $(".skip-link").addEventListener("click", (ev) => {
      ev.preventDefault();
      main.tabIndex = -1;
      main.focus();
    });
    return main;
  };
  // Keeps root's .cart-count (visible) and .cart-count-sr (screen readers) showing this browser's cart size.
  const showCartCount = (root) => {
    const draw = () => {
      const n = cart.count();
      $(".cart-count", root).textContent = n ? ` ${n}` : "";
      $(".cart-count-sr", root).textContent = n ? `, ${n} item${n === 1 ? "" : "s"}` : "";
    };
    draw();
    addEventListener("gs:cart", draw);
    addEventListener("storage", (ev) => ev.key === "gs:cart" && draw());
  };

  // A project's look (its colours, type and tiles) for anything of its shown outside its own pages: returns the class
  // to add ("look-<id>", or "" for a project without a skin) and loads css/projects/<id>/look.css once.
  const look = (projectId) => {
    const p = (window.PROJECTS || []).find((x) => x.id === projectId);
    if (!p || !p.skin) return "";
    const href = `/css/projects/${p.id}/look.css`;
    if (!document.querySelector(`link[href^="${href}"]`)) document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${href}">`);
    return `look-${p.id}`;
  };
  // A drop-in module's project (its data-project, else the open project's id, else "") and its look: a module showing a
  // project's things outside that project's own pages wears its look on the module's element.
  const moduleProject = (el) => el.dataset.project || currentProject().id || "";
  const wear = (el, projectId) => {
    const cls = projectId && projectId !== currentProject().id ? look(projectId) : "";
    if (cls) el.classList.add(cls);
  };
  // Where a store item opens: its own page (Studio products carry theirs as path; catalog products are /shop/<id>).
  const shopItemPath = (p) => p.path || `/shop/${encodeURIComponent(p.id)}`;

  // An in-page swap animated as a view transition; an aborted one rejects its promises, so they're handled (page
  // changes are handled in js/theme.js, which runs before the first paint).
  const quiet = (t) => t && [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p && p.catch(() => {}));
  const viewSwap = (fn) => (document.startViewTransition ? quiet(document.startViewTransition(fn)) : fn());

  // A form's or panel's status line (its .msg): announced politely when things went fine, as an alert when not.
  const say = (root, text, error = false) => {
    const m = $(".msg", root);
    if (!m) return;
    m.className = "msg" + (error ? " error" : "");
    m.setAttribute("role", error ? "alert" : "status");
    m.textContent = text;
  };

  return { $, escapeHTML, money, cents, parseDate, fmtDate, isSet, jsonLd, api, safeNext, loginPath, cart, track, projectPath, currentProject, skipLink, showCartCount, look, moduleProject, wear, shopItemPath, viewSwap, say };
})();
window.GS = GS;
