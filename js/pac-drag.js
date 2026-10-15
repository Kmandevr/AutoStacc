// Pac editor: drag and drop inside the builder's tree (js/pac-editor.js): a file card or folder dragged onto a folder
// (or the top) moves there; files dropped from the computer onto one are added there. The folder under the pointer is
// highlighted. GS.pacDrag.bind(box, { move(item, folderId|null), add([{ name, blob }], folderId|null) }); item is
// "file:<asset>" or "folder:<id>". Needs js/util.js and js/pac-drop.js (to read dropped folders).
(function () {
  "use strict";

  const ITEM = "application/x-pac-item";

  function bind(box, on) {
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
      if (item) return on.move(item, to);
      const files = await window.GS.pacDrop.read(ev.dataTransfer);
      if (files.length) on.add(files, to);
    };
  }

  window.GS.pacDrag = { bind };
})();
