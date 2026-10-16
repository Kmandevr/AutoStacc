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
    unsafe_entries: "Unsafe entries (names that climb out of the Pac, links, archive bombs)",
    deceptive_files: "Files whose contents don't match their names",
    damaged_files: "Damaged files",
    encrypted_files: "Password-protected files",
    executables: "Programs or scripts",
    unsupported_files: "File types AutoStacc doesn't deliver",
    nested_archives: "Archives inside the Pac (their contents aren't checked)",
    mostly_unknown_formats: "Most files are in formats AutoStacc can't identify",
    all_duplicates: "Every file is already in another of your Pacs",
    big_revision: "This version removes a large part of the one that's live",
    silent_audio: "Much of the audio is silent",
    undecodable_audio: "Much of the audio can't be played"
  };
  const STATE = { draft: "Draft", uploading: "Uploading", processing: "Checking", ready: "Draft, ready to publish", in_review: "Waiting for AutoStacc's review",
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
      ${c.removed + c.replaced ? `<p class="small-print">Buyers who already have this product keep removed and replaced files for 30 days after you publish, with a notice in Your Stacc.</p>` : ""}
      ${removed ? `<details><summary>${plural(c.removed, "file")} removed</summary><ul>${removed}</ul>${c.removed > d.removed.length ? `<p class="small-print">and ${c.removed - d.removed.length} more</p>` : ""}</details>` : ""}`;
  }

  function actions(v, admin) {
    const s = v.stats || {};
    if (v.status === "ready") {
      const held = !admin && s.review && s.review.verdict === "hold";
      return `<p class="small-print">Not live yet: buyers keep the live version's files until you publish this one. Publishing changes which files
          buyers download; whether the product is on sale is set in Release.</p>
        <div class="actions"><button class="btn" type="button" data-pack-publish${s.files ? "" : " disabled"}>Publish this version (${plural(s.files || 0, "file")})</button>
        <button class="btn ghost danger" type="button" data-pack-discard>Discard draft</button></div>
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
    not_queued: "checking couldn't start",
    processing_failed: "the files couldn't be checked",
    import_failed: "the checked files couldn't be saved",
    missing_files: "some uploaded files went missing before they were saved",
    engine_unreachable: "the file checker couldn't be reached"
  };
  // What to do after a failure: nothing changed for buyers, and a new upload starts a new version (no duplicates).
  const NEXT = {
    quota_exceeded: "Free some storage (remove files or Pacs you no longer sell), then upload again.",
    too_many_files: "Split the files over more than one Pac, then upload again.",
    storage_full: "Try again later; AutoStacc needs to make room first."
  };
  const noteText = (code) => (code ? NOTES[code] || code : "");
  // A failed version (not a rejection) or one AutoStacc's review didn't accept: what happened and what to do next.
  function recovery(v) {
    if (v.status !== "failed") return "";
    if (v.rejected) return `<p class="msg error">Not accepted by AutoStacc's review${v.note ? `: ${e(v.note)}` : "."} Nothing changed for buyers. Fix what the note says and upload again, or <a href="/contact">contact AutoStacc</a> if it's unclear.</p>`;
    return `<p class="msg error">This version failed (${e(noteText(v.note) || "something went wrong")}). Nothing changed for buyers: the live version stays as it is.
      ${e(NEXT[v.note] || "Drop or upload the files again to start a new version; files AutoStacc already has aren't stored twice.")}</p>`;
  }

  function render(v, { admin = false } = {}) {
    const s = v.stats || {};
    const label = v.status === "failed" && v.rejected ? "Not accepted by review" : STATE[v.status] || v.status;
    const head = `<p><strong>Version ${v.number}</strong> · ${e(label)}${v.note && !v.rejected ? ` (${e(noteText(v.note))})` : ""}</p>${recovery(v)}`;
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

  window.GS.packVersion = { render, noteText, STATE };
})();
