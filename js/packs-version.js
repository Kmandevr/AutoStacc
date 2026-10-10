// Pack Builder (Control Center and Studio): one version as the store answered it: its state, what the checks kept and
// refused, the automated review's flags with their reasons, the actions this person may take, then the review table
// (js/packs-review.js). Sets GS.packVersion.render(v, { admin }) for js/admin-packs.js and js/studio-packs.js; the
// server decides every action, this only offers them. Needs js/util.js and js/packs-review.js.
(function () {
  "use strict";

  const e = window.GS.escapeHTML;
  const mb = (n) => `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  // Each flag of the automated review (server/packs/review.js), in plain words.
  const FLAGS = {
    unsafe_entries: "Unsafe entries (names that climb out of the pack, links, archive bombs)",
    deceptive_files: "Files whose contents don't match their names",
    damaged_files: "Damaged files",
    encrypted_files: "Password-protected files",
    executables: "Programs or scripts",
    unsupported_files: "File types AutoStacc doesn't deliver",
    mostly_unknown_formats: "Most files are in formats AutoStacc can't identify",
    all_duplicates: "Every file is already in another of your packs",
    big_revision: "This version removes a large part of the one that's live"
  };
  const STATE = { draft: "Draft", uploading: "Uploading", processing: "Checking", ready: "Checked", in_review: "Waiting for AutoStacc's review",
    published: "Published", superseded: "Replaced by a newer version", failed: "Failed", discarded: "Discarded" };

  function flags(review) {
    if (!review || !review.flags || !review.flags.length) return review ? `<p class="small-print">Automated review: nothing flagged.</p>` : "";
    return `<details open><summary>Automated review: ${plural(review.flags.length, "flag")}</summary><ul>${review.flags.map((f) =>
      `<li>${e(FLAGS[f.code] || f.code)} (${f.count})${f.hard ? " · always reviewed by AutoStacc" : ""}${f.examples && f.examples.length ? `: ${f.examples.map((x) => `<code>${e(x)}</code>`).join(", ")}` : ""}</li>`).join("")}</ul></details>`;
  }

  function actions(v, admin) {
    const s = v.stats || {};
    if (v.status === "ready") {
      const held = !admin && s.review && s.review.verdict === "hold";
      return `<div class="actions"><button class="btn" type="button" data-pack-publish${s.files ? "" : " disabled"}>Publish ${plural(s.files || 0, "file")}</button>
        <button class="btn ghost" type="button" data-pack-discard>Discard</button></div>
        ${held ? `<p class="small-print">Because of the flags above, AutoStacc reviews this version before buyers get it.</p>` : ""}`;
    }
    if (v.status === "in_review") {
      return admin ? `<div class="actions"><button class="btn" type="button" data-pack-publish>Approve and publish</button>
          <button class="btn ghost" type="button" data-pack-reject>Reject…</button></div>`
        : `<div class="actions"><button class="btn ghost" type="button" data-pack-discard>Withdraw and discard</button></div>`;
    }
    return "";
  }

  function render(v, { admin = false } = {}) {
    const s = v.stats || {};
    const head = `<p><strong>Version ${v.number}</strong> · ${e(STATE[v.status] || v.status)}${v.note ? ` (${e(v.note)})` : ""}</p>`;
    if (v.status === "processing") return `${head}<p class="small-print">Checking every file… this page updates by itself.</p>`;
    if (!["ready", "in_review", "published", "superseded"].includes(v.status)) return head;
    const refused = (s.refused || []).map((r) => `<li><code>${e(r.path)}</code>: ${e(r.codes.join(", "))}</li>`).join("");
    return `${head}
      <p>${plural(s.files, "file")} kept (${mb(s.bytes || 0)}) in ${plural(s.folders, "folder")}${s.ignored ? `; ${plural(s.ignored, "system file")} ignored` : ""}.</p>
      ${refused ? `<details open><summary>${plural(s.refused.length, "file")} refused (never reach customers)</summary><ul>${refused}</ul></details>` : ""}
      ${flags(s.review)}
      ${actions(v, admin)}
      <p class="small-print">Suggestions come from names and the files' own headers; a percentage is how sure the engine is. Your own values and folder defaults always win, and nothing suggested is shown to customers as fact.</p>
      ${window.GS.packReview.render(v)}`;
  }

  window.GS.packVersion = { render };
})();
