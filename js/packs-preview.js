// Pack Builder (Control Center and Studio): lists a chosen ZIP in the browser before it uploads (js/engine/engine-worker.js, the
// engine's WebAssembly build in a Web Worker): its files, folders, size and anything the engine would refuse, in about
// a second even for gigabytes, since only the archive's directory is read. A preview only: the server checks
// everything again after the upload. Sets GS.packPreview.list(file) → Promise of { result } or { error }; loads before
// js/admin-packs.js and js/studio-packs.js. Needs js/util.js.
(function () {
  "use strict";

  let worker = null;

  function list(file) {
    return new Promise((resolve) => {
      try {
        if (!worker) worker = new Worker("/js/engine/engine-worker.js");
      } catch {
        resolve({ error: "This browser can't preview archives." });
        return;
      }
      // A worker that never answers (blocked, out of memory) doesn't hold the page: the upload works without a preview.
      const timer = setTimeout(() => { worker.terminate(); worker = null; resolve({ error: "The preview took too long." }); }, 20000);
      worker.onmessage = ({ data }) => { clearTimeout(timer); resolve(data); };
      worker.onerror = () => { clearTimeout(timer); worker = null; resolve({ error: "The preview couldn't start." }); };
      worker.postMessage({ file });
    });
  }

  window.GS.packPreview = { list };
})();
