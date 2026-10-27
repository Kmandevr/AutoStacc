// Pac editor (docs/packs.md, "Pac editor"; owner, 2026-10-15): the visual builder inside the Pack Builder, for the
// Studio and the Control Center. With a version in progress that can change: its tree of file cards (js/pac-tree.js);
// files and folders dragged onto a folder (js/pac-drag.js, or moved with Move, from the keyboard); files dropped from the computer onto
// a folder (or "Add here") added there (js/pac-add.js); audio played in place (js/pac-player.js); new folders, renames,
// removals and a read me written here. Without one: "Edit this Pac" starts a draft copied from the live version
// (dropping files does too, js/pac-drop.js). Publishing and discarding stay with js/packs-version.js. After each change
// focus returns to the control used, or to the status line. GS.pacEditor.attach(box, version|null, { base,
// draft: { url, body }, onChanged(version), reload(versionId) }). Needs js/util.js, js/pac-tree.js, js/pac-add.js,
// js/pac-player.js, js/pac-drag.js and js/pac-drop.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  let refocus = null, note = null; // carried across the redraw a change causes

  // A selector that finds the same control after a redraw.
  const selectorOf = (el) => {
    const a = el && [...el.attributes].find((x) => x.name.startsWith("data-pe-"));
    return a ? `[${a.name}="${CSS.escape(a.value)}"]` : null;
  };

  function attach(box, v, opts) {
    if (!box) return;
    if (!(window.FEATURES && window.FEATURES["packs.editor"])) { box.innerHTML = ""; return; }
    const say = (t, error) => { const m = $("[data-pe-status]", box); if (m) { m.textContent = t; m.classList.toggle("error", Boolean(error)); } };
    box.ondragstart = box.ondragover = box.ondragleave = box.ondrop = box.onchange = box.onsubmit = null;
    if (!v || v.status !== "ready") {
      window.GS.pacPlayer.stop();
      const live = v && v.status === "published";
      box.innerHTML = live ? `<div class="panel pe-start"><p>Change this Pac without uploading it again: rearrange, rename or remove files, make folders, write a read me. Buyers keep the live version until you publish.</p>
        <div class="actions"><button class="btn ghost" type="button" data-pe-draft>Edit this Pac</button></div><p class="msg" role="status" tabindex="-1" data-pe-status></p></div>` : "";
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
    const readme = v.files.find((f) => !f.folderId && /^read[ _-]?me\b.*\.txt$/i.test(f.filename));
    const fileUrl = (asset) => `${opts.base}/versions/${encodeURIComponent(v.id)}/files/${encodeURIComponent(asset)}`;
    box.innerHTML = `<section class="panel pe" aria-labelledby="pe-h"><h3 id="pe-h">Builder</h3>
      <p class="small-print">Drag files and folders onto a folder to arrange them (or use Move), or drop files from your computer onto one to add them there. Up to 2,000 files, each under 4 GB.</p>
      <p class="small-print">Values you set on a file below (kind, tempo, key…) are saved on the file at once: discarding this draft keeps them. Buyers see them only after you publish.</p>
      <div class="pe-tools">
        <button class="btn ghost small" type="button" data-pe-newfolder>New folder</button>
        <button class="btn ghost small" type="button" data-pe-readme>${readme ? "Edit the read me" : "Write a read me"}</button>
        <input type="file" multiple hidden data-pe-add>
      </div>
      <div class="pe-move" data-pe-move hidden><label for="pe-move-to" data-pe-move-label>Move to</label>
        <select id="pe-move-to" data-pe-move-to></select>
        <button class="btn small" type="button" data-pe-move-go>Move</button><button class="link-btn" type="button" data-pe-move-cancel>Cancel</button></div>
      <p class="msg" role="status" tabindex="-1" data-pe-status></p>
      <form class="pe-readme" data-pe-readme-form hidden><label for="pe-readme-text">Read me (ships in the Pac as ${e(readme ? readme.filename : "Read me.txt")}, and buyers can read it on the product page)</label>
        <textarea id="pe-readme-text" name="text" rows="8" maxlength="60000"></textarea>
        <div class="actions"><button class="btn small" type="submit">Save read me</button><button class="btn ghost small" type="button" data-pe-readme-cancel>Cancel</button></div></form>
      ${window.GS.pacTree.render(v, { editable: true })}</section>`;
    window.GS.pacPlayer.sync(box, fileUrl);
    if (note) { say(note.text, note.error); note = null; }
    if (refocus) { const el = $(refocus, box) || $("[data-pe-status]", box); refocus = null; if (el) el.focus(); }

    let addTo = null, moving = null, busy = false;
    // One change at a time; its control (if any) is disabled meanwhile and focused again after the redraw.
    const send = async (method, path, body, btn) => {
      if (busy) return say("Still saving the last change…");
      busy = true;
      if (btn) btn.disabled = true;
      const res = await api(`${opts.base}/versions/${encodeURIComponent(v.id)}${path}`, { method, body });
      busy = false;
      if (btn) btn.disabled = false;
      if (!res.ok) return say(res.error.message, true);
      refocus = selectorOf(btn) || "[data-pe-status]";
      opts.onChanged(res.data.version);
    };
    const pathOf = (id) => (id ? v.folders.find((f) => f.id === id).path : "the top of the Pac");
    // A file ("file:<asset>") or folder ("folder:<id>") into a folder (null: the top).
    const move = (item, to, btn) => {
      const [kind, id] = item.split(":");
      if (kind === "file") return send("POST", "/move", { assetIds: [id], folderId: to }, btn);
      if (id !== to) return send("PATCH", `/folders/${encodeURIComponent(id)}`, { parentId: to }, btn);
    };
    // Where a folder may go: not into itself or anything inside it.
    const inside = (id) => {
      const out = new Set([id]);
      for (let grew = true; grew;) { grew = false; for (const f of v.folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) (out.add(f.id), (grew = true)); }
      return out;
    };

    async function addFiles(files, folderId, zip) {
      if (busy) return say("Still working on the last change…");
      busy = true;
      say("Preparing…");
      try {
        const res = await window.GS.pacAdd.add({ base: opts.base, versionId: v.id, folderId, files, zip, onStatus: (t) => say(t) });
        const s = res.addition.stats || {};
        const refused = window.GS.pacAdd.refusedText(s);
        note = { text: `Added ${s.files || 0} file${s.files === 1 ? "" : "s"} to ${pathOf(folderId)}.${refused}`, error: Boolean(refused) };
        refocus = "[data-pe-status]";
        opts.onChanged(res.version);
      } catch (err) { say(err.message, true); } finally { busy = false; }
    }

    box.onchange = (ev) => {
      const input = ev.target.closest("[data-pe-add]");
      if (!input || !input.files.length) return;
      const files = [...input.files];
      input.value = "";
      addFiles(files, addTo, null);
    };

    // Dragging inside the tree moves; files from the computer are added where they land (js/pac-drag.js).
    window.GS.pacDrag.bind(box, { move: (item, to) => move(item, to),
      add: (files, to) => { const one = files.length === 1 && /\.zip$/i.test(files[0].name); addFiles(one ? [] : files, to, one ? files[0].blob : null); } });

    box.onsubmit = async (ev) => {
      const form = ev.target.closest("[data-pe-readme-form]");
      if (!form) return;
      ev.preventDefault();
      await send("PUT", "/readme", { text: form.elements.text.value, ...(readme ? { filename: readme.filename } : {}) }, $("button[type=submit]", form));
    };

    box.onclick = async (ev) => {
      const play = ev.target.closest("[data-pe-play]");
      if (play) return window.GS.pacPlayer.toggle(play, fileUrl(play.dataset.pePlay), () => say("Your browser can't play this file here.", true));
      const tg = ev.target.closest("[data-pe-toggle]");
      if (tg) {
        const open = tg.getAttribute("aria-expanded") !== "true";
        tg.setAttribute("aria-expanded", String(open));
        tg.closest(".pe-folder").querySelector(".pe-kids").hidden = !open;
        return;
      }
      const t = ev.target.closest("[data-pe-target]");
      if (t) { addTo = t.dataset.peTarget; return $("[data-pe-add]", box).click(); }
      const mv = ev.target.closest("[data-pe-moveitem]");
      if (mv) {
        moving = mv.dataset.peMoveitem;
        const [kind, id] = moving.split(":");
        const skip = kind === "folder" ? inside(id) : new Set();
        const bar = $("[data-pe-move]", box);
        $("[data-pe-move-to]", bar).innerHTML = `<option value="">Top of the Pac</option>${v.folders.filter((f) => !skip.has(f.id))
          .map((f) => `<option value="${e(f.id)}">${e(f.path)}</option>`).join("")}`;
        $("[data-pe-move-label]", bar).textContent = `Move ${mv.dataset.peName} to`;
        bar.hidden = false;
        refocus = selectorOf(mv);
        return $("[data-pe-move-to]", bar).focus();
      }
      const go = ev.target.closest("[data-pe-move-go]");
      if (go && moving) return move(moving, $("[data-pe-move-to]", box).value || null, go);
      if (ev.target.closest("[data-pe-move-cancel]")) {
        moving = null;
        $("[data-pe-move]", box).hidden = true;
        const back = refocus && $(refocus, box);
        refocus = null;
        return back && back.focus();
      }
      if (ev.target.closest("[data-pe-newfolder]")) {
        const name = prompt("Name of the new folder (drag it where you want it afterwards):");
        if (name) return send("POST", "/folders", { name, parentId: null }, ev.target.closest("button"));
        return;
      }
      if (ev.target.closest("[data-pe-readme]")) {
        const form = $("[data-pe-readme-form]", box);
        form.hidden = false;
        if (readme && !form.elements.text.value) {
          const r = await fetch(fileUrl(readme.assetId), { credentials: "same-origin" }).catch(() => null);
          if (r && r.ok) form.elements.text.value = (await r.text()).replace(/\r\n/g, "\n");
        }
        return form.elements.text.focus();
      }
      if (ev.target.closest("[data-pe-readme-cancel]")) { $("[data-pe-readme-form]", box).hidden = true; return $("[data-pe-readme]", box).focus(); }
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
      if (rm && await window.GS.confirm("Remove this file from the version? Buyers keep the live version until you publish.")) return send("POST", "/remove", { assetIds: [rm.dataset.peRmfile] }, rm);
      const rmf = ev.target.closest("[data-pe-rmfolder]");
      if (rmf && await window.GS.confirm("Remove this folder and everything in it from the version?")) return send("DELETE", `/folders/${encodeURIComponent(rmf.dataset.peRmfolder)}`, undefined, rmf);
    };
  }

  window.GS.pacEditor = { attach };
})();
