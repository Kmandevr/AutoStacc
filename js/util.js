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

  return { $, escapeHTML, money, parseDate, fmtDate };
})();
window.GS = GS;
