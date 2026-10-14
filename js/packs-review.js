// Pack Builder (Control Center and Studio): reviewing a checked version before it's published (docs/packs.md, Phase 4). Files that
// need a decision come first; each value shows where it comes from (yours, a folder's default, a suggestion you
// accepted, or one the engine is sure of); unsure suggestions are offered to accept or reject; selected files can be
// given a value, sent back to inheriting, or moved to another folder (with a preview of what that changes, from
// js/pack-resolve.js); a folder can be given a default for everything below it. Sets GS.packReview { render, bind(el, onChanged, base) }
// for js/admin-packs.js and js/studio-packs.js (base: the scope's API prefix). Needs js/util.js, js/pack-resolve.js, data/content-types.js and data/vocabulary.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const R = () => window.GS.packResolve;
  const LABELS = { kind: "Kind", instrument: "Instrument", bpm: "BPM", key: "Key", midiRole: "MIDI role" };
  const SOURCE = { creator: "yours", folder: "folder default", accepted: "accepted", auto: "engine, sure" };

  function choices(field) {
    const v = window.VOCABULARY || {};
    if (field === "kind") return Object.entries(window.CONTENT_TYPES || {}).map(([k, t]) => [k, t.label]);
    if (field === "instrument") return Object.entries((v.assets || {}).instruments || {});
    if (field === "midiRole") return Object.entries((v.assets || {}).midiRoles || {});
    if (field === "key") return Object.entries(((v.facets || {}).key || {}).values || {});
    return null; // bpm: typed
  }

  const valueLabel = (field, value) => ((choices(field) || []).find(([k]) => k === value) || [value, value])[1];

  function cell(f, field) {
    const r = f.resolved[field];
    const open = (f.suggestions || []).filter((s) => s.field === field && s.status === "suggested" && (!r || s.value !== r.value));
    const shown = r ? `<strong>${e(valueLabel(field, r.value))}</strong> <small class="small-print">${e(SOURCE[r.source] || r.source)}${r.folder ? ` (${e(r.folder)})` : ""}${r.confidence ? ` ${Math.round(r.confidence * 100)}%` : ""}</small>` : `<span class="small-print">–</span>`;
    const offers = open.map((s) => `<span class="chip">${e(valueLabel(field, s.value))} ${Math.round(s.confidence * 100)}%${s.origin === "analysis" ? " heard" : ""}
      <button class="link" type="button" data-decide="${e(f.assetId)}" data-field="${field}" data-value="${e(s.value)}" data-accept="1" aria-label="Accept">✓</button>
      <button class="link" type="button" data-decide="${e(f.assetId)}" data-field="${field}" data-value="${e(s.value)}" data-accept="0" aria-label="Reject">✕</button></span>`).join(" ");
    return `<td>${shown}${offers ? `<br>${offers}` : ""}</td>`;
  }

  // A small waveform from the engine's analysis (100 peaks, 0 to 100), when it listened to the file; decoration only.
  function wave(peaks) {
    if (!Array.isArray(peaks) || !peaks.length || !peaks.every((p) => Number.isFinite(p))) return "";
    const bars = peaks.map((p, i) => { const h = Math.max(1, Math.min(100, p)) / 100 * 9; return `M${i} ${10 - h}V${10 + h}`; }).join("");
    return ` <svg class="pack-wave" viewBox="0 0 ${peaks.length} 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${bars}"/></svg>`;
  }

  // Files without a kind, then replaced files (their values came from the bytes they replace), then new files and files
  // with suggestions waiting for a decision, first.
  const needsLook = (f) => (!f.resolved.kind ? 4 : 0) + (f.change === "replaced" ? 2 : 0)
    + (f.change === "new" || (f.suggestions || []).some((s) => s.status === "suggested" && !(f.resolved[s.field] && f.resolved[s.field].value === s.value)) ? 1 : 0);
  // How a file relates to the live version (server/packs/revision.js); unchanged files say nothing.
  const CHANGE = { new: "new", moved: "moved or renamed", replaced: "replaced: check its values" };

  function render(v) {
    const files = [...v.files].sort((a, b) => needsLook(b) - needsLook(a));
    const fieldOpts = Object.entries(LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
    const folderOpts = v.folders.map((f) => `<option value="${e(f.id)}">${e(f.path)}</option>`).join("");
    const head = Object.values(LABELS).map((l) => `<th>${l}</th>`).join("");
    const rows = files.map((f) => `<tr><td><input type="checkbox" data-pick="${e(f.assetId)}" aria-label="Select ${e(f.filename)}"></td>
      <td><code>${e(f.folderPath ? `${f.folderPath}/` : "")}${e(f.filename)}</code><br><small class="small-print">${e(f.format)}</small>${wave(f.facts && f.facts.peaks)}${f.change ? ` <span class="tag">${e(CHANGE[f.change] || f.change)}</span>` : ""}</td>
      ${Object.keys(LABELS).map((field) => cell(f, field)).join("")}</tr>`).join("");
    const tools = v.editable ? `<div class="panel wide" data-review-tools>
        <div class="field"><label for="rv-target">Apply to</label><select id="rv-target" name="target"><option value="">Selected files</option>${v.folders.map((f) => `<option value="folder:${e(f.id)}">Default for folder ${e(f.path)}</option>`).join("")}</select></div>
        <div class="field"><label for="rv-field">Field</label><select id="rv-field" name="field">${fieldOpts}</select></div>
        <div class="field"><label for="rv-value">Value</label><input id="rv-value" name="value" list="rv-values" autocomplete="off"><datalist id="rv-values"></datalist></div>
        <div class="actions"><button class="btn" type="button" data-review-set>Set</button><button class="btn ghost" type="button" data-review-clear>Inherit / remove</button></div>
        <div class="field"><label for="rv-move">Move selected files to</label><select id="rv-move" name="move"><option value="">Top of the Pac</option>${folderOpts}</select></div>
        <p class="small-print" data-move-preview></p>
        <div class="actions"><button class="btn ghost" type="button" data-review-move>Move</button></div>
        <p class="msg" role="status"></p></div>` : "";
    return `${tools}<div class="table-wrap"><table><thead><tr><th></th><th>File</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // One handler set per tab; the open version is read from its box each time.
  function bind(el, onChanged, base = "/api/admin/packs") {
    const box = () => $("[data-pack-version]", el);
    const picked = () => [...el.querySelectorAll("[data-pick]:checked")].map((x) => x.dataset.pick);
    const status = (t) => { const m = $("[data-review-tools] [role=status]", el); if (m) m.textContent = t; };
    const current = () => box().__version;
    async function send(method, path, body, btn) {
      if (btn) btn.disabled = true;
      const res = await api(`${base}/versions/${encodeURIComponent(current().id)}${path}`, { method, body });
      if (btn) btn.disabled = false;
      if (!res.ok) { status(res.error.message); return; }
      onChanged(res.data.version);
    }
    function fillValues() {
      const field = $("#rv-field", el) && $("#rv-field", el).value;
      const list = $("#rv-values", el);
      if (list) list.innerHTML = (choices(field) || []).map(([k, l]) => `<option value="${e(k)}">${e(l)}</option>`).join("");
    }
    function previewMove() {
      const out = $("[data-move-preview]", el);
      const v = current();
      if (!out || !v) return;
      const ids = picked();
      const to = $("#rv-move", el).value || null;
      if (!ids.length) { out.textContent = ""; return; }
      const changes = R().moveChanges({
        entries: v.files.map((f) => ({ assetId: f.assetId, folderId: f.folderId })),
        folders: v.folders.map((f) => ({ id: f.id, parentId: f.parentId, name: f.name })),
        values: v.files.flatMap((f) => [...(f.suggestions || []), ...Object.entries(f.own || {}).map(([field, value]) => ({ field, value, origin: "creator", status: "accepted" }))].map((x) => ({ ...x, assetId: f.assetId }))),
        folderValues: v.folders.flatMap((f) => Object.entries(f.values || {}).map(([field, value]) => ({ folderId: f.id, field, value })))
      }, ids, to);
      out.textContent = changes.length ? `Moving changes ${changes.length} inherited value${changes.length === 1 ? "" : "s"}: ${changes.slice(0, 6).map((c) => `${LABELS[c.field]} ${c.from || "–"} → ${c.to || "–"}`).join("; ")}${changes.length > 6 ? "…" : ""}. Your own values stay.` : "Nothing inherited changes.";
    }
    el.addEventListener("change", (ev) => {
      if (ev.target.id === "rv-field") fillValues();
      if (ev.target.id === "rv-move" || ev.target.matches("[data-pick]")) previewMove();
    });
    el.addEventListener("focusin", (ev) => { if (ev.target.id === "rv-value") fillValues(); });
    el.addEventListener("click", (ev) => {
      const d = ev.target.closest("[data-decide]");
      if (d) return send("POST", "/suggestions", { assetIds: [d.dataset.decide], field: d.dataset.field, value: d.dataset.value, accept: d.dataset.accept === "1" }, d);
      const set = ev.target.closest("[data-review-set], [data-review-clear]");
      if (set) {
        const target = $("#rv-target", el).value, field = $("#rv-field", el).value;
        const value = set.hasAttribute("data-review-clear") ? null : $("#rv-value", el).value.trim();
        if (target.startsWith("folder:")) return send("PUT", `/folders/${encodeURIComponent(target.slice(7))}/values`, { field, value }, set);
        if (!picked().length) return status("Select files first, or apply to a folder.");
        return send("PUT", "/values", { assetIds: picked(), field, value }, set);
      }
      const mv = ev.target.closest("[data-review-move]");
      if (mv) {
        if (!picked().length) return status("Select files to move.");
        return send("POST", "/move", { assetIds: picked(), folderId: $("#rv-move", el).value || null }, mv);
      }
    });
  }

  window.GS.packReview = { render, bind };
})();
