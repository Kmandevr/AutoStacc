// Pac editor (docs/packs.md, "Pac editor"; owner, 2026-10-15): the Pac as a file manager inside the Pack Builder, for the
// Studio and the Control Center. With a version in progress that can change: its tree (js/pac-tree.js), files added into
// a chosen folder one or many at a time (or a whole folder; js/pac-add.js), new folders, renames, removals and a read me
// written here. Without one: "Edit this Pac" starts a draft copied from the live version (or an empty one). Publishing
// and discarding stay with js/packs-version.js. GS.pacEditor.attach(box, version|null, { base, draft: { url, body },
// onChanged(version), reload() }). Needs js/util.js, js/pac-tree.js and js/pac-add.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;

  function attach(box, v, opts) {
    if (!box) return;
    if (!(window.FEATURES && window.FEATURES["packs.editor"])) { box.innerHTML = ""; return; }
    const say = (t, error) => { const m = $("[data-pe-status]", box); if (m) { m.textContent = t; m.classList.toggle("error", Boolean(error)); } };
    if (!v || v.status !== "ready") {
      const live = v && v.status === "published";
      box.innerHTML = v && ["processing", "uploading", "in_review"].includes(v.status) ? "" : `<div class="panel pe-start">
        <p>${live ? "Change this Pac one file at a time: add files into folders, make or remove folders, write a read me. Buyers keep the live version until you publish." : "Or build the Pac one file at a time: add files into folders as you go, then publish."}</p>
        <div class="actions"><button class="btn ghost" type="button" data-pe-draft>${live ? "Edit this Pac" : "Build it file by file"}</button></div><p class="msg" role="status" data-pe-status></p></div>`;
      box.onclick = async (ev) => {
        const b = ev.target.closest("[data-pe-draft]");
        if (!b) return;
        b.disabled = true;
        const res = await api(opts.draft.url, { method: "POST", body: { ...opts.draft.body, idempotencyKey: crypto.randomUUID() } });
        if (!res.ok) { b.disabled = false; return say(res.error.message, true); }
        opts.reload(res.data.version.id);
      };
      return;
    }
    const folderOpts = v.folders.map((f) => `<option value="${e(f.id)}">${e(f.path)}</option>`).join("");
    const readme = v.files.find((f) => !f.folderId && /^read[ _-]?me\b.*\.txt$/i.test(f.filename));
    box.innerHTML = `<section class="panel pe" aria-labelledby="pe-h"><h3 id="pe-h">Files in this version</h3>
      <div class="pe-tools">
        <div class="field"><label for="pe-target">Add to</label><select id="pe-target" data-pe-folder><option value="">Top of the Pac</option>${folderOpts}</select></div>
        <label class="btn small studio-upload">Add files<input type="file" multiple hidden data-pe-add></label>
        <label class="btn ghost small studio-upload">Add a folder<input type="file" webkitdirectory multiple hidden data-pe-add></label>
        <button class="btn ghost small" type="button" data-pe-newfolder>New folder</button>
        <button class="btn ghost small" type="button" data-pe-readme>${readme ? "Edit the read me" : "Write a read me"}</button>
      </div>
      <p class="msg" role="status" data-pe-status></p>
      <form class="pe-readme" data-pe-readme-form hidden><label for="pe-readme-text">Read me (ships in the Pac as ${e(readme ? readme.filename : "Read me.txt")}, and buyers can read it on the product page)</label>
        <textarea id="pe-readme-text" name="text" rows="8" maxlength="60000"></textarea>
        <div class="actions"><button class="btn small" type="submit">Save read me</button><button class="btn ghost small" type="button" data-pe-readme-cancel>Cancel</button></div></form>
      ${window.GS.pacTree.render(v, { editable: true })}</section>`;

    const target = () => $("[data-pe-folder]", box).value || null;
    const send = async (method, path, body, btn) => {
      if (btn) btn.disabled = true;
      const res = await api(`${opts.base}/versions/${encodeURIComponent(v.id)}${path}`, { method, body });
      if (btn) btn.disabled = false;
      if (!res.ok) return say(res.error.message, true);
      opts.onChanged(res.data.version);
    };

    box.onchange = async (ev) => {
      const input = ev.target.closest("[data-pe-add]");
      if (!input || !input.files.length) return;
      const files = [...input.files];
      box.querySelectorAll("[data-pe-add]").forEach((x) => (x.disabled = true));
      try {
        const res = await window.GS.pacAdd.add({ base: opts.base, versionId: v.id, folderId: target(), files, onStatus: (t) => say(t) });
        const s = res.addition.stats || {};
        opts.onChanged(res.version);
        const refused = (s.refused || []).map((r) => `${r.path} (${r.codes.join(", ")})`);
        say(`Added ${s.files || 0} file${s.files === 1 ? "" : "s"}.${refused.length ? ` Not added: ${refused.slice(0, 5).join("; ")}${refused.length > 5 ? "…" : ""}.` : ""}`, refused.length > 0);
      } catch (err) {
        box.querySelectorAll("[data-pe-add]").forEach((x) => (x.disabled = false));
        say(err.message, true);
      }
    };

    box.onsubmit = async (ev) => {
      const form = ev.target.closest("[data-pe-readme-form]");
      if (!form) return;
      ev.preventDefault();
      await send("PUT", "/readme", { text: form.elements.text.value, ...(readme ? { filename: readme.filename } : {}) }, $("button[type=submit]", form));
    };

    box.onclick = async (ev) => {
      const t = ev.target.closest("[data-pe-target]");
      if (t) { $("[data-pe-folder]", box).value = t.dataset.peTarget; return say(`Files you add now go into ${v.folders.find((f) => f.id === t.dataset.peTarget).path}.`); }
      if (ev.target.closest("[data-pe-newfolder]")) {
        const name = prompt(target() ? "Name of the new folder inside the chosen one:" : "Name of the new folder:");
        if (name) return send("POST", "/folders", { name, parentId: target() }, ev.target);
        return;
      }
      if (ev.target.closest("[data-pe-readme]")) {
        const form = $("[data-pe-readme-form]", box);
        form.hidden = false;
        if (readme && !form.elements.text.value) {
          const r = await fetch(`${opts.base}/versions/${encodeURIComponent(v.id)}/files/${encodeURIComponent(readme.assetId)}`, { credentials: "same-origin" }).catch(() => null);
          if (r && r.ok) form.elements.text.value = (await r.text()).replace(/\r\n/g, "\n");
        }
        return form.elements.text.focus();
      }
      if (ev.target.closest("[data-pe-readme-cancel]")) { $("[data-pe-readme-form]", box).hidden = true; return; }
      const rn = ev.target.closest("[data-pe-rename]");
      if (rn) {
        const f = v.files.find((x) => x.assetId === rn.dataset.peRename);
        const name = prompt("New name (keep the extension):", f.filename);
        if (name && name !== f.filename) return send("PATCH", `/files/${encodeURIComponent(f.assetId)}`, { filename: name }, rn);
        return;
      }
      const rf = ev.target.closest("[data-pe-renamefolder]");
      if (rf) {
        const f = v.folders.find((x) => x.id === rf.dataset.peRenamefolder);
        const name = prompt("New folder name:", f.name);
        if (name && name !== f.name) return send("PATCH", `/folders/${encodeURIComponent(f.id)}`, { name }, rf);
        return;
      }
      const rm = ev.target.closest("[data-pe-rmfile]");
      if (rm && confirm("Remove this file from the version? Buyers keep the live version until you publish.")) return send("POST", "/remove", { assetIds: [rm.dataset.peRmfile] }, rm);
      const rmf = ev.target.closest("[data-pe-rmfolder]");
      if (rmf && confirm("Remove this folder and everything in it from the version?")) return send("DELETE", `/folders/${encodeURIComponent(rmf.dataset.peRmfolder)}`, undefined, rmf);
    };
  }

  window.GS.pacEditor = { attach };
})();
