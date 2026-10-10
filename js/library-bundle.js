// Your Stacc: "Download folder (ZIP)" on a Pac's folder ([data-bundle] buttons drawn by js/library-view.js inside any
// [data-stacc]). Asks the store for a short-lived link to one ZIP of those files (POST /api/downloads/bundle; ownership
// is checked there, per product) and starts the download. Needs js/util.js.
(function () {
  "use strict";

  const { api, escapeHTML: e } = window.GS;

  async function bundle(btn) {
    const fileIds = btn.dataset.bundle.split(" ").filter(Boolean);
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    const res = await api("/api/downloads/bundle", { method: "POST", body: { fileIds } });
    btn.disabled = false;
    btn.textContent = label;
    const head = btn.closest(".stacc-group-head");
    const old = head && head.querySelector("[data-bundle-msg]");
    if (old) old.remove();
    if (!res.ok) {
      if (head) head.insertAdjacentHTML("beforeend", `<p class="msg error" role="alert" data-bundle-msg>${e(res.error.message)}</p>`);
      return;
    }
    const a = document.createElement("a");
    a.href = res.data.url;
    a.download = "";
    document.body.append(a);
    a.click();
    a.remove();
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-stacc] [data-bundle]");
    if (btn && !btn.disabled) bundle(btn);
  });
})();
