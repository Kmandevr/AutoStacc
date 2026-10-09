// Control Center on phones: gives every table cell its column heading (data-label) so css/admin.css can show each row as a
// small card instead of a table that scrolls sideways. Watches #admin-app because every tab draws its own tables.
(function () {
  "use strict";

  const root = document.getElementById("admin-app");
  if (!root || !window.MutationObserver) return;

  function label(table) {
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll("tbody tr").forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.colSpan > 1) return;
        const text = heads[i];
        if (text && td.dataset.label !== text) td.dataset.label = text;
      });
    });
  }

  let queued = false;
  const run = () => { queued = false; root.querySelectorAll(".admin-table table").forEach(label); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(root, { childList: true, subtree: true });
  run();
})();
