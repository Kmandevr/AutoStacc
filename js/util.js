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
    data.error || (data.message ? { code: data.code || "http_" + status, message: data.message } : { code: "http_" + status, message: "Something went wrong." });

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
      return { ok: false, status: 0, data: {}, error: { code: "network", message: "Signal lost. Check your connection and try again." } };
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

  return { $, escapeHTML, money, cents, parseDate, fmtDate, isSet, jsonLd, api, cart, track };
})();
window.GS = GS;
