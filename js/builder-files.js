// The visual builder's Files and History tabs (GS.builderFiles; docs/builder.md). Files: upload images (PNG, JPEG,
// GIF, WebP) and fonts (WOFF2), each checked by its bytes on the server, with the creator's one storage cap shown;
// copy a file's address for CSS; delete (a file a published page or a kept version still uses is hidden until nothing
// does). History: the last 20 publishes with Restore (into the draft), and scheduled publishing. Buttons carry
// data-action for js/builder.js. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  function filesPanel(data) {
    const s = data.storage;
    const items = data.files.map((f) => `<li>${f.contentType.startsWith("image/") ? `<img src="${e(f.src)}" alt="" loading="lazy">` : '<span class="bx-font" aria-hidden="true">Aa</span>'}
      <span class="bx-file-name">${e(f.filename)}<small>${size(f.sizeBytes)}</small></span>
      <button class="btn ghost small" type="button" data-action="copy" data-text="${e(f.src)}">Copy address</button>
      <button class="btn ghost small danger" type="button" data-action="file-delete" data-id="${e(f.id)}">Delete</button></li>`).join("");
    return `<div class="bx-head"><h3>Files</h3></div>
      <label class="btn small bx-upload">Upload image or font<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,.woff2,font/woff2" data-action="upload" hidden></label>
      <p class="small-print">Images (PNG, JPEG, GIF, WebP) up to ${size(data.options.limits.imageBytes)}; fonts (.woff2) up to ${size(data.options.limits.fontBytes)}.</p>
      <p class="bx-meter"><span>Storage: ${size(s.usedBytes)} of ${size(s.quotaBytes)}</span><meter min="0" max="${s.quotaBytes}" value="${s.usedBytes}" aria-label="Storage used"></meter></p>
      <p class="small-print">One cap for everything you store on AutoStacc: site files and the files you sell. At the cap only new uploads stop.</p>
      <ul class="bx-files">${items || "<li>No files yet.</li>"}</ul>`;
  }

  function historyPanel(data, versions) {
    const sched = data.site.scheduledAt;
    const list = versions === null ? '<p class="msg pending">Loading…</p>' : versions.length ? `<ol class="bx-versions">${versions.map((v) => `<li><span>Version ${v.version}<small>${e(when(v.publishedAt))}${v.scheduled ? " · scheduled" : v.byYou ? "" : " · by a teammate"}</small></span>
      <button class="btn ghost small" type="button" data-action="restore" data-version="${v.version}">Restore</button></li>`).join("")}</ol>` : "<p>Nothing published yet.</p>";
    return `<div class="bx-head"><h3>History</h3></div>
      <h4 class="bx-sub">Publish later</h4>
      ${sched ? `<p>Your saved draft goes live <strong>${e(when(sched))}</strong>. Changes after scheduling stay in the draft.</p><button class="btn ghost small" type="button" data-action="unschedule">Cancel the schedule</button>`
        : `<div class="field"><label for="bx-when">Date and time (your time)</label><input id="bx-when" type="datetime-local"></div><button class="btn small" type="button" data-action="schedule">Schedule the saved draft</button>`}
      <h4 class="bx-sub">Published versions</h4>
      <p class="small-print">The last ${data.options.limits.versionsPerSite} publishes. Restoring puts that version in your draft; publish to make it live.</p>
      ${list}`;
  }

  window.GS.builderFiles = { filesPanel, historyPanel, size };
})();
