// Pac editor: a version's folders and files as a tree (docs/packs.md, "Pac editor"), for js/pac-editor.js. Folders
// nest (collapsible), each with its files; when the version can still change, every folder and file has its actions
// (rename, remove; a folder's "add files here" and "new folder inside" pick it as the target). Pure: data in, HTML out.
// Sets GS.pacTree.render(version, { editable }). Needs js/util.js.
(function () {
  "use strict";

  const e = window.GS.escapeHTML;
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const CHANGE = { new: "new", moved: "moved", replaced: "replaced" };

  function render(v, { editable = false } = {}) {
    const kids = new Map();
    for (const f of v.folders) (kids.get(f.parentId || "") || kids.set(f.parentId || "", []).get(f.parentId || "")).push(f);
    const filesIn = new Map();
    for (const f of v.files) (filesIn.get(f.folderId || "") || filesIn.set(f.folderId || "", []).get(f.folderId || "")).push(f);
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const fileItem = (f) => `<li class="pe-file" data-asset="${e(f.assetId)}">
        <span class="pe-name">${e(f.filename)}</span> <span class="small-print">${e(size(f.sizeBytes))}${f.format ? ` · ${e(f.format)}` : ""}</span>${f.change && CHANGE[f.change] ? ` <span class="tag">${CHANGE[f.change]}</span>` : ""}
        ${editable ? `<span class="pe-actions"><button class="link-btn" type="button" data-pe-rename="${e(f.assetId)}" aria-label="Rename ${e(f.filename)}">Rename</button>
          <button class="link-btn" type="button" data-pe-rmfile="${e(f.assetId)}" aria-label="Remove ${e(f.filename)}">Remove</button></span>` : ""}</li>`;
    const level = (parentId) => {
      const folders = (kids.get(parentId) || []).sort(byName);
      const files = (filesIn.get(parentId) || []).sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
      if (!folders.length && !files.length) return parentId ? '<p class="small-print pe-empty">Empty folder</p>' : "";
      return `<ul class="pe-level">${folders.map((f) => `<li class="pe-folder" data-folder="${e(f.id)}"><details open><summary><span class="pe-name">${e(f.name)}</span>
          ${editable ? `<span class="pe-actions"><button class="link-btn" type="button" data-pe-target="${e(f.id)}" aria-label="Add files to ${e(f.name)}">Add here</button>
            <button class="link-btn" type="button" data-pe-renamefolder="${e(f.id)}" aria-label="Rename folder ${e(f.name)}">Rename</button>
            <button class="link-btn" type="button" data-pe-rmfolder="${e(f.id)}" aria-label="Remove folder ${e(f.name)}">Remove</button></span>` : ""}</summary>
          ${level(f.id)}</details></li>`).join("")}${files.map(fileItem).join("")}</ul>`;
    };
    const body = level("");
    return `<div class="pe-tree">${body || '<p class="small-print">No files yet. Add some to get started.</p>'}</div>`;
  }

  window.GS.pacTree = { render };
})();
