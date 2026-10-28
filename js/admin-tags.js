// Control Center: Tags (owner, 2026-10-27, #230; server/tags/routes.js), under Community. The most-used tags on
// AutoStacc and the site-wide rules: hide a tag everywhere, or rename it (everything tagged with it shows and is found
// under the new name), and lift a rule. Nothing tagged is rewritten; every change is audited. Starts on "gs:admin".
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  if (!$("#admin-app")) return;

  function draw(box, data, message) {
    const ruled = new Map(data.rules.map((r) => [r.tag, r]));
    box.innerHTML = `<h3>Tags</h3>${message ? `<p class="msg" role="status">${e(message)}</p>` : ""}
      <p class="small-print">Anyone can type tags on what they make or post. Hide one that shouldn't be used, or rename one so its spellings come together. Tags with strong words or slurs are refused already.</p>
      <form class="admin-form" data-tag-rule>
        <div class="field"><label for="tr-tag">Tag</label><input id="tr-tag" name="tag" required maxlength="40" autocapitalize="off"></div>
        <div class="field"><label for="tr-action">Do</label><select id="tr-action" name="action"><option value="hide">Hide everywhere</option><option value="rename">Rename to</option></select></div>
        <div class="field"><label for="tr-to">New name <span class="small-print">(for Rename)</span></label><input id="tr-to" name="renameTo" maxlength="40" autocapitalize="off"></div>
        <button class="btn small" type="submit">Save rule</button>
      </form>
      <div class="admin-table"><table><thead><tr><th>Rule</th><th></th></tr></thead><tbody>${data.rules.map((r) => `<tr>
        <td>#${e(r.tag)} ${r.action === "hide" ? "is hidden" : `shows as #${e(r.renameTo)}`}</td>
        <td><button class="btn ghost small" type="button" data-lift-tag="${e(r.tag)}">Lift</button></td></tr>`).join("") || '<tr><td colspan="2">No rules.</td></tr>'}</tbody></table></div>
      <p class="small-print">Most used: ${data.top.slice(0, 40).map((t) => `#${e(t.tag)} (${t.count})${ruled.has(t.tag) ? "*" : ""}`).join(", ") || "none yet"}</p>`;
  }

  async function load(box, message) {
    const r = await api("/api/admin/tags");
    if (!r.ok) { box.innerHTML = `<p class="msg error">${e(r.error.message)}</p>`; return; }
    draw(box, r.data, message);
  }

  window.addEventListener("gs:admin", () => {
    const after = $("#admin-community");
    if (!after) return;
    const box = document.createElement("section");
    box.id = "admin-tags";
    box.className = "admin-tags";
    after.after(box);
    load(box);
    box.addEventListener("submit", async (ev) => {
      const f = ev.target.closest("[data-tag-rule]");
      if (!f) return;
      ev.preventDefault();
      const b = f.querySelector("[type=submit]");
      b.disabled = true;
      const res = await api("/api/admin/tags", { method: "PUT", body: { tag: f.elements.tag.value, action: f.elements.action.value, renameTo: f.elements.action.value === "rename" ? f.elements.renameTo.value : undefined } });
      load(box, res.ok ? "Saved." : res.error.message);
    });
    box.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-lift-tag]");
      if (!b || !await window.GS.confirm(`Lift the rule for #${b.dataset.liftTag}?`)) return;
      b.disabled = true;
      const res = await api("/api/admin/tags", { method: "DELETE", body: { tag: b.dataset.liftTag } });
      load(box, res.ok ? "Lifted." : res.error.message);
    });
  });
})();
