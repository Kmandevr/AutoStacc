// Pac editor: a version's folders and files as a visual tree (docs/packs.md, "Pac editor"), for js/pac-editor.js.
// Folders nest (collapsible); each file is a card: an icon for its kind, its waveform when the engine listened to it,
// badges for format, tempo, key and length, and a play button for audio. When the version can still change, files and
// folders can be dragged onto a folder (or the top) and each has its actions (rename, remove; a folder's "add here" and
// "new folder inside" pick it as the target). Pure: data in, HTML out. Sets GS.pacTree.render(version, { editable }).
// Needs js/util.js.
(function () {
  "use strict";

  const e = window.GS.escapeHTML;
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const CHANGE = { new: "new", moved: "moved", replaced: "replaced" };
  const ICON = { loops: "↻", "one-shots": "◆", stems: "≡", midi: "♪", presets: "⚙", "sample-libraries": "▤", "project-files": "▣",
    documents: "¶", images: "▨", video: "▶" };
  const AUDIO = /\.(wav|wave|aif|aiff|flac|mp3|ogg|oga|m4a)$/i;
  const valueOf = (f, field) => (f.resolved && f.resolved[field] ? f.resolved[field].value : null);
  const length = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

  // The loudest sample in each slice (0 to 100) as bars around the middle line.
  function wave(peaks) {
    if (!Array.isArray(peaks) || !peaks.length) return "";
    const d = peaks.map((p, i) => { const h = Math.max(0.6, (p / 100) * 20); return `M${i + 0.5} ${(10 - h / 2).toFixed(1)}v${h.toFixed(1)}`; }).join("");
    return `<svg class="pe-wave" viewBox="0 0 ${peaks.length} 20" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  }

  function badges(f) {
    const x = f.facts || {};
    const out = [];
    if (f.format) out.push(f.format.toUpperCase());
    const bpm = valueOf(f, "bpm"), key = valueOf(f, "key");
    if (bpm) out.push(`${bpm} BPM`);
    if (key) out.push(key);
    if (x.durationMs) out.push(length(x.durationMs));
    if (x.sampleRate) out.push(`${(x.sampleRate / 1000).toFixed(x.sampleRate % 1000 ? 1 : 0)} kHz${x.bitDepth ? ` · ${x.bitDepth}-bit` : ""}`);
    out.push(size(f.sizeBytes));
    return out.map((b) => `<span class="pe-badge">${e(b)}</span>`).join("");
  }

  function card(f, editable) {
    const kind = valueOf(f, "kind") || "";
    const play = AUDIO.test(f.filename);
    return `<li class="pe-file" data-asset="${e(f.assetId)}"${editable ? ` draggable="true" data-pe-drag="file:${e(f.assetId)}"` : ""}>
      <span class="pe-icon" data-kind="${e(kind)}" aria-hidden="true">${ICON[kind] || "•"}</span>
      ${play ? `<button class="pe-play" type="button" data-pe-play="${e(f.assetId)}" aria-label="Play ${e(f.filename)}" aria-pressed="false">▶</button>` : ""}
      <span class="pe-main"><span class="pe-name">${e(f.filename)}</span>${f.change && CHANGE[f.change] ? ` <span class="tag">${CHANGE[f.change]}</span>` : ""}
        ${wave((f.facts || {}).peaks)}<span class="pe-badges">${kind ? `<span class="pe-badge">${e(kind)}</span>` : ""}${badges(f)}</span></span>
      ${editable ? `<span class="pe-actions"><button class="link-btn" type="button" data-pe-moveitem="file:${e(f.assetId)}" data-pe-name="${e(f.filename)}" aria-label="Move ${e(f.filename)}">Move</button>
        <button class="link-btn" type="button" data-pe-rename="${e(f.assetId)}" aria-label="Rename ${e(f.filename)}">Rename</button>
        <button class="link-btn" type="button" data-pe-rmfile="${e(f.assetId)}" aria-label="Remove ${e(f.filename)}">Remove</button></span>` : ""}</li>`;
  }

  function render(v, { editable = false } = {}) {
    const kids = new Map();
    for (const f of v.folders) (kids.get(f.parentId || "") || kids.set(f.parentId || "", []).get(f.parentId || "")).push(f);
    const filesIn = new Map();
    for (const f of v.files) (filesIn.get(f.folderId || "") || filesIn.set(f.folderId || "", []).get(f.folderId || "")).push(f);
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const level = (parentId) => {
      const folders = (kids.get(parentId) || []).sort(byName);
      const files = (filesIn.get(parentId) || []).sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
      if (!folders.length && !files.length) return parentId ? `<p class="small-print pe-empty">Empty folder${editable ? ": drop files here" : ""}</p>` : "";
      return `<ul class="pe-level">${folders.map((f) => `<li class="pe-folder" data-folder="${e(f.id)}"${editable ? ` data-pe-drop="${e(f.id)}"` : ""}><details open>
          <summary${editable ? ` draggable="true" data-pe-drag="folder:${e(f.id)}"` : ""}><span class="pe-icon" aria-hidden="true">▸</span><span class="pe-name">${e(f.name)}</span>
          ${editable ? `<span class="pe-actions"><button class="link-btn" type="button" data-pe-target="${e(f.id)}" aria-label="Add files to ${e(f.name)}">Add here</button>
            <button class="link-btn" type="button" data-pe-moveitem="folder:${e(f.id)}" data-pe-name="${e(f.name)}" aria-label="Move folder ${e(f.name)}">Move</button>
            <button class="link-btn" type="button" data-pe-renamefolder="${e(f.id)}" aria-label="Rename folder ${e(f.name)}">Rename</button>
            <button class="link-btn" type="button" data-pe-rmfolder="${e(f.id)}" aria-label="Remove folder ${e(f.name)}">Remove</button></span>` : ""}</summary>
          ${level(f.id)}</details></li>`).join("")}${files.map((f) => card(f, editable)).join("")}</ul>`;
    };
    const body = level("");
    return `<div class="pe-tree"${editable ? ' data-pe-drop=""' : ""}>${body || `<p class="small-print">No files yet.${editable ? " Drop some here, or use the drop zone above." : ""}</p>`}</div>`;
  }

  window.GS.pacTree = { render, wave };
})();
