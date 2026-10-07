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

  return { $, escapeHTML, money, parseDate, fmtDate, isSet, jsonLd };
})();
window.GS = GS;
