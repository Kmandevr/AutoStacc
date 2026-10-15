// Pac editor (docs/packs.md, "Pac editor"; owner, 2026-10-15): the visual builder inside the Pack Builder, for the
// Studio and the Control Center. With a version in progress that can change: its tree of file cards (js/pac-tree.js);
// files and folders dragged onto a folder (or moved with Move, from the keyboard); files dropped from the computer onto
// a folder (or "Add here") added there (js/pac-add.js); audio played in place; new folders, renames, removals and a read
// me written here. Without one: "Edit this Pac" starts a draft copied from the live version (dropping files does too,
// js/pac-drop.js). Publishing and discarding stay with js/packs-version.js. GS.pacEditor.attach(box, version|null,
// { base, draft: { url, body }, onChanged(version), reload(versionId) }). Needs js/util.js, js/pac-tree.js, js/pac-add.js
// and js/pac-drop.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const ITEM = "application/x-pac-item";
  let player; // one clip at a time, across redraws

  function attach(box, v, opts) {
    if (!box) return;
    if (!(window.FEATURES && window.FEATURES["packs.editor"])) { box.innerHTML = ""; return; }
    const say = (t, error) => { const m = $("[data-pe-status]", box); if (m) { m.textContent = t; m.classList.toggle("error", Boolean(error)); } };
    if (!v || v.status !== "ready") {
      const live = v && v.status === "published";
      box.innerHTML = live ? `<div class="panel pe-start"><p>Change this Pac without uploading it again: rearrange, rename or remove files, make folders, write a read me. Buyers keep the live version until you publish.</p>
        <div class="actions"><button class="btn ghost" type="button" data-pe-draft>Edit this Pac</button></div><p class="msg" role="status" data-pe-status></p></div>` : "";
      box.onclick = async (ev) => {
        const b = ev.target.closest("[data-pe-draft]");
        if (!b) return;
        b.disabled = true;
        const res = await api(opts.draft.url, { method: "POST", body: { ...opts.draft.body, idempotencyKey: crypto.randomUUID() } });
        if (!res.ok) { b.disabled = false; return say(res.error.message, true); }
        opts.reload(res.data.version.id);
      };
      box.ondragstart = box.ondragover = box.ondrop = null;
      return;
    }
    const folderOpts = v.folders.map((f) => `<option value="${e(f.id)}">${e(f.path)}</option>`).join("");
    const readme = v.files.find((f) => !f.folderId && /^read[ _-]?me\b.*\.txt$/i.test(f.filename));
    box.innerHTML = `<section class="panel pe" aria-labelledby="pe-h"><h3 id="pe-h">Builder</h3>
      <p class="small-print">Drag files and folders onto a folder to arrange them, or drop files from your computer onto one to add them there.</p>
      <div class="pe-tools">
        <button class="btn ghost small" type="button" data-pe-newfolder>New folder</button>
        <button class="btn ghost small" type="button" data-pe-readme>${readme ? "Edit the read me" : "Write a read me"}</button>
        <input type="file" multiple hidden data-pe-add>
      </div>
      <div class="pe-move" data-pe-move hidden><label for="pe-move-to" data-pe-move-label>Move to</label>
        <select id="pe-move-to" data-pe-move-to><option value="">Top of the Pac</option>${folderOpts}</select>
        <button class="btn small" type="button" data-pe-move-go>Move</button><button class="link-btn" type="button" data-pe-move-cancel>Cancel</button></div>
      <p class="msg" role="status" data-pe-status></p>
      <form class="pe-readme" data-pe-readme-form hidden><label for="pe-readme-text">Read me (ships in the Pac as ${e(readme ? readme.filename : "Read me.txt")}, and buyers can read it on the product page)</label>
        <textarea id="pe-readme-text" name="text" rows="8" maxlength="60000"></textarea>
        <div class="actions"><button class="btn small" type="submit">Save read me</button><button class="btn ghost small" type="button" data-pe-readme-cancel>Cancel</button></div></form>
      ${window.GS.pacTree.render(v, { editable: true })}</section>`;

    let addTo = null, moving = null;
    const send = async (method, path, body, btn) => {
      if (btn) btn.disabled = true;
      const res = await api(`${opts.base}/versions/${encodeURIComponent(v.id)}${path}`, { method, body });
      if (btn) btn.disabled = false;
      if (!res.ok) return say(res.error.message, true);
      opts.onChanged(res.data.version);
    };
    const pathOf = (id) => (id ? v.folders.find((f) => f.id === id).path : "the top of the Pac");
    // A file ("file:<asset>") or folder ("folder:<id>") into a folder (null: the top).
    const move = (item, to) => {
      const [kind, id] = item.split(":");
      if (kind === "file") return send("POST", "/move", { assetIds: [id], folderId: to });
      if (id !== to) return send("PATCH", `/folders/${encodeURIComponent(id)}`, { parentId: to });
    };

    async function addFiles(files, folderId, zip) {
      say("Preparing…");
      try {
        const res = await window.GS.pacAdd.add({ base: opts.base, versionId: v.id, folderId, files, zip, onStatus: (t) => say(t) });
        const s = res.addition.stats || {};
        opts.onChanged(res.version);
        const refused = (s.refused || []).map((r) => `${r.path} (${r.codes.join(", ")})`);
        say(`Added ${s.files || 0} file${s.files === 1 ? "" : "s"} to ${pathOf(folderId)}.${refused.length ? ` Not added: ${refused.slice(0, 5).join("; ")}${refused.length > 5 ? "…" : ""}.` : ""}`, refused.length > 0);
      } catch (err) { say(err.message, true); }
    }

    box.onchange = (ev) => {
      const input = ev.target.closest("[data-pe-add]");
      if (input && input.files.length) addFiles([...input.files], addTo, null);
    };

    // Dragging inside the tree moves; files from the computer are added where they land.
    const dropOf = (ev) => ev.target.closest("[data-pe-drop]");
    const clear = () => box.querySelectorAll(".pe-over").forEach((x) => x.classList.remove("pe-over"));
    box.ondragstart = (ev) => {
      const d = ev.target.closest("[data-pe-drag]");
      if (!d) return;
      ev.dataTransfer.setData(ITEM, d.dataset.peDrag);
      ev.dataTransfer.effectAllowed = "move";
    };
    box.ondragover = (ev) => {
      const t = dropOf(ev), types = [...ev.dataTransfer.types];
      if (!t || !(types.includes(ITEM) || types.includes("Files"))) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = types.includes(ITEM) ? "move" : "copy";
      if (!t.classList.contains("pe-over")) { clear(); t.classList.add("pe-over"); }
    };
    box.ondragleave = (ev) => { if (!box.contains(ev.relatedTarget)) clear(); };
    box.ondrop = async (ev) => {
      const t = dropOf(ev);
      clear();
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation(); // not the page's drop zone as well
      const to = t.dataset.peDrop || null;
      const item = ev.dataTransfer.getData(ITEM);
      if (item) return move(item, to);
      const files = await window.GS.pacDrop.read(ev.dataTransfer);
      if (!files.length) return;
      const one = files.length === 1 && /\.zip$/i.test(files[0].name);
      addFiles(one ? [] : files, to, one ? files[0].blob : null);
    };

    box.onsubmit = async (ev) => {
      const form = ev.target.closest("[data-pe-readme-form]");
      if (!form) return;
      ev.preventDefault();
      await send("PUT", "/readme", { text: form.elements.text.value, ...(readme ? { filename: readme.filename } : {}) }, $("button[type=submit]", form));
    };

    box.onclick = async (ev) => {
      const play = ev.target.closest("[data-pe-play]");
      if (play) {
        const src = `${opts.base}/versions/${encodeURIComponent(v.id)}/files/${encodeURIComponent(play.dataset.pePlay)}`;
        if (!player) player = new Audio();
        const same = player.dataset.src === src && !player.paused;
        player.pause();
        document.querySelectorAll("[data-pe-play][aria-pressed=true]").forEach((b) => { b.setAttribute("aria-pressed", "false"); b.textContent = "▶"; });
        if (same) return;
        player.src = src;
        player.dataset.src = src;
        player.onended = () => { play.setAttribute("aria-pressed", "false"); play.textContent = "▶"; };
        play.setAttribute("aria-pressed", "true");
        play.textContent = "❚❚";
        return player.play().catch(() => { play.setAttribute("aria-pressed", "false"); play.textContent = "▶"; say("Your browser can't play this file here.", true); });
      }
      const t = ev.target.closest("[data-pe-target]");
      if (t) { addTo = t.dataset.peTarget; return $("[data-pe-add]", box).click(); }
      const mv = ev.target.closest("[data-pe-moveitem]");
      if (mv) {
        moving = mv.dataset.peMoveitem;
        const bar = $("[data-pe-move]", box);
        bar.hidden = false;
        $("[data-pe-move-label]", bar).textContent = `Move ${mv.dataset.peName} to`;
        return $("[data-pe-move-to]", bar).focus();
      }
      if (ev.target.closest("[data-pe-move-go]") && moving) return move(moving, $("[data-pe-move-to]", box).value || null);
      if (ev.target.closest("[data-pe-move-cancel]")) { moving = null; $("[data-pe-move]", box).hidden = true; return; }
      if (ev.target.closest("[data-pe-newfolder]")) {
        const name = prompt("Name of the new folder (drag it where you want it afterwards):");
        if (name) return send("POST", "/folders", { name, parentId: null }, ev.target);
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
