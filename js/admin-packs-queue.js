// Control Center, Packs tab: creators' versions held by the automated review (GET /api/admin/packs/review), oldest
// first, with who sent them and why they were held; "Open" shows one in the Packs tab (js/admin-packs.js handles
// [data-pack-open]) to approve or reject. Redraws on "gs:packs-changed". Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  let box;

  async function draw() {
    const res = await api("/api/admin/packs/review");
    if (!res.ok) { box.innerHTML = ""; return; }
    const held = res.data.versions;
    box.innerHTML = held.length ? `<div class="panel wide"><h3>Waiting for review (${held.length})</h3><ul class="plain">${held.map((v) =>
      `<li><button class="link" type="button" data-pack-open="${e(v.id)}">${e(v.pac)}, version ${v.number}</button>
        · ${v.creator ? `${e(v.creator.name)} (/${e(v.creator.slug)})` : "AutoStacc"} · ${v.files} files
        · ${v.flags.length ? e(v.flags.map((f) => f.code).join(", ")) : "always reviewed"}</li>`).join("")}</ul></div>`
      : `<p class="small-print">No creator's version is waiting for review.</p>`;
  }

  addEventListener("gs:admin", () => {
    box = $("#admin-packs [data-pack-queue]");
    if (!box) return;
    draw();
    addEventListener("gs:packs-changed", draw);
  });
})();
