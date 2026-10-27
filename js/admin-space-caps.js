// Control Center: Settings › Switches, under "Communities per account" (owner, 2026-10-27, #214): accounts AutoStacc
// lets start more (or fewer) communities than the site-wide number, set by community username with an optional note,
// and removed with a confirmation (/api/admin/community/space-caps, server/community/features/spaces/caps.js;
// audited). Its own box beside the Switches panel, so the panel's redraws leave it alone; nothing when the community
// or its spaces feature is off (the API answers 404). Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;

  function draw(box, data, message, error) {
    box.innerHTML = `<form class="admin-switch-row admin-notice" data-cap-exception>
        <div><h3>Accounts with their own number</h3>
          <p>Lets one account start more (or fewer) communities than the ${e(data.cap)} everyone else may. Removing it puts them back on the site-wide number; communities they already run stay.</p>
          ${message ? `<p class="msg${error ? " error" : ""}" role="status">${e(message)}</p>` : ""}
          <div class="admin-cap-fields">
            <div class="field"><label for="cap-name">Username</label><input id="cap-name" maxlength="60" required autocomplete="off"></div>
            <div class="field"><label for="cap-number">Communities</label><input id="cap-number" type="number" min="0" max="99" inputmode="numeric" required></div>
            <div class="field"><label for="cap-note">Why (optional)</label><input id="cap-note" maxlength="200"></div>
          </div></div>
        <div class="actions"><button class="btn small" type="submit">Save</button></div>
      </form>
      <div class="admin-table"><table><thead><tr><th>Username</th><th>Communities</th><th>Runs now</th><th>Why</th><th></th></tr></thead><tbody>
        ${data.exceptions.map((x) => `<tr><td>${e(x.name || "no username")}</td><td>${e(x.cap)}</td><td>${e(x.owned)}</td><td>${e(x.note)}</td>
          <td><button class="btn ghost small" type="button" data-cap-remove="${e(x.userId)}" data-cap-who="${e(x.name || "this account")}">Remove</button></td></tr>`).join("")
          || '<tr><td colspan="5">None: everyone has the site-wide number.</td></tr>'}</tbody></table></div>`;
  }

  async function load(box, message, error) {
    const r = await api("/api/admin/community/space-caps");
    if (!r.ok) { box.remove(); return; }
    draw(box, r.data, message, error);
  }

  addEventListener("gs:admin", () => {
    const panel = $("#admin-switches");
    if (!panel || $("[data-space-caps]")) return;
    panel.insertAdjacentHTML("afterend", '<div class="admin-panel" data-space-caps></div>');
    const box = $("[data-space-caps]");
    load(box);
    box.addEventListener("submit", async (ev) => {
      if (!ev.target.matches("[data-cap-exception]")) return;
      ev.preventDefault();
      const btn = $("button[type=submit]", ev.target);
      btn.disabled = true;
      const res = await api("/api/admin/community/space-caps", { method: "PUT",
        body: { name: $("#cap-name", box).value.trim(), cap: Number($("#cap-number", box).value), note: $("#cap-note", box).value.trim() } });
      await load(box, res.ok ? `${res.data.exception.name} may start ${res.data.exception.cap}.` : res.error.message, !res.ok);
    });
    box.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-cap-remove]");
      if (!b || !await window.GS.confirm(`Put ${b.dataset.capWho} back on the site-wide number?`)) return;
      b.disabled = true;
      const res = await api(`/api/admin/community/space-caps/${encodeURIComponent(b.dataset.capRemove)}`, { method: "DELETE" });
      await load(box, res.ok ? "Removed." : res.error.message, !res.ok);
    });
  });
})();
