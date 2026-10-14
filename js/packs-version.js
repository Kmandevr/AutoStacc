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
    nested_archives: "Archives inside the pack (their contents aren't checked)",
    mostly_unknown_formats: "Most files are in formats AutoStacc can't identify",
    all_duplicates: "Every file is already in another of your packs",
    big_revision: "This version removes a large part of the one that's live",
    silent_audio: "Much of the audio is silent",
    undecodable_audio: "Much of the audio can't be played"
  };
  const STATE = { draft: "Draft", uploading: "Uploading", processing: "Checking", ready: "Checked", in_review: "Waiting for AutoStacc's review",
    published: "Published", superseded: "Replaced by a newer version", failed: "Failed", discarded: "Discarded" };

  function flags(review) {
    if (!review || !review.flags || !review.flags.length) return review ? `<p class="small-print">Automated review: nothing flagged.</p>` : "";
    return `<details open><summary>Automated review: ${plural(review.flags.length, "flag")}</summary><ul>${review.flags.map((f) =>
      `<li>${e(FLAGS[f.code] || f.code)} (${f.count})${f.hard ? " · always reviewed by AutoStacc" : ""}${f.examples && f.examples.length ? `: ${f.examples.map((x) => `<code>${e(x)}</code>`).join(", ")}` : ""}</li>`).join("")}</ul></details>`;
  }

  // As a revision of the live version (server/packs/revision.js): what changes for buyers when this is published.
  function changes(d) {
    if (!d) return "";
    const c = d.counts;
    const removed = d.removed.map((r) => `<li><code>${e(r.folderPath ? `${r.folderPath}/` : "")}${e(r.filename)}</code></li>`).join("");
    return `<p>Compared with the live version: ${c.same} unchanged, ${c.moved} moved or renamed, ${c.replaced} replaced, ${c.added} new, ${c.removed} removed.
      Unchanged and moved files keep their values and stay the same files for buyers.</p>
      ${c.removed + c.replaced ? `<p class="small-print">Buyers who already have this pack keep removed and replaced files for 30 days after you publish, with a notice in Your Stacc.</p>` : ""}
      ${removed ? `<details><summary>${plural(c.removed, "file")} removed</summary><ul>${removed}</ul>${c.removed > d.removed.length ? `<p class="small-print">and ${c.removed - d.removed.length} more</p>` : ""}</details>` : ""}`;
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

  // Why a version stopped or waits (server/packs/process.js), in plain words; anything else is shown as it is.
  const NOTES = {
    waiting_for_allowance: "waiting: AutoStacc has used this month's processing allowance, so checking starts on the 1st (or sooner if more is added)",
    storage_full: "AutoStacc's file storage is full for now",
    quota_exceeded: "the files don't fit in your storage",
    too_many_files: "more files than one version can hold",
    timed_out: "checking took too long",
    not_queued: "checking couldn't start"
  };

  function render(v, { admin = false } = {}) {
    const s = v.stats || {};
    const head = `<p><strong>Version ${v.number}</strong> · ${e(STATE[v.status] || v.status)}${v.note ? ` (${e(NOTES[v.note] || v.note)})` : ""}</p>`;
    if (v.status === "processing" && v.note === "waiting_for_allowance") {
      return `${head}<div class="actions"><button class="btn ghost" type="button" data-pack-discard>Discard</button></div>`;
    }
    if (v.status === "processing") return `${head}<p class="small-print">Checking every file… this page updates by itself.</p>`;
    if (!["ready", "in_review", "published", "superseded"].includes(v.status)) return head;
    const refused = (s.refused || []).map((r) => `<li><code>${e(r.path)}</code>: ${e(r.codes.join(", "))}</li>`).join("");
    return `${head}
      <p>${plural(s.files, "file")} kept (${mb(s.bytes || 0)}) in ${plural(s.folders, "folder")}${s.ignored ? `; ${plural(s.ignored, "system file")} ignored` : ""}.</p>
      ${refused ? `<details open><summary>${plural(s.refused.length, "file")} refused (never reach customers)</summary><ul>${refused}</ul></details>` : ""}
      ${changes(s.diff)}
      ${flags(s.review)}
      ${actions(v, admin)}
      <p><a class="btn ghost small" href="/api/${admin ? "admin" : "studio"}/packs/versions/${e(v.id)}/download" download>Download this version's originals (ZIP)</a></p>
      <p class="small-print">Suggestions come from names, the files' own headers and, marked "heard", listening to the audio; a percentage is how sure the engine is, and what it only heard is never sure enough to count without you. Your own values and folder defaults always win, and nothing suggested is shown to customers as fact.</p>
      ${window.GS.packReview.render(v)}`;
  }

  window.GS.packVersion = { render };
})();
