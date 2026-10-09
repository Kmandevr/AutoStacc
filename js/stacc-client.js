// Runs Your Stacc's model for js/library.js on a background thread (js/stacc-worker.js) and returns its answers as
// promises; where Worker is missing or fails (file:// previews, old browsers, a worker that can't load), the same model
// (GS.stacc.answer) runs on the page instead, replaying the last build. Sets GS.staccClient. Needs js/stacc-model.js.
(function () {
  "use strict";

  const GS = window.GS;
  GS.staccClient = function () {
    const memo = {}, pending = new Map();
    let lastBuild = null, next = 0, worker = null;

    // The page-side model: after a fallback it first rebuilds the assets the worker held.
    function local(msg) {
      if (msg.type !== "build" && !memo.assets && lastBuild) GS.stacc.answer(memo, lastBuild);
      return GS.stacc.answer(memo, msg);
    }

    function fallBack() {
      if (worker) worker.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const p of waiting) { try { p.resolve(local(p.msg)); } catch (err) { p.reject(err); } }
    }

    try { worker = typeof Worker === "function" ? new Worker("/js/stacc-worker.js") : null; } catch { worker = null; }
    if (worker) {
      worker.onmessage = (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if ("error" in e.data) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      };
      worker.onerror = (e) => { e.preventDefault(); fallBack(); };
      worker.onmessageerror = fallBack;
    }

    // msg: { type: "build", items, catalog } or { type: "view", view, filter }. Answers come back in order.
    function ask(msg) {
      if (msg.type === "build") { lastBuild = msg; memo.assets = null; }
      if (!worker) return new Promise((resolve) => resolve(local(msg)));
      const id = ++next;
      return new Promise((resolve, reject) => {
        pending.set(id, { msg, resolve, reject });
        try { worker.postMessage({ ...msg, id }); } catch { fallBack(); }
      });
    }

    return { ask, get threaded() { return !!worker; } };
  };
})();
