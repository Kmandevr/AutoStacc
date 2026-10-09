// Your Stacc's background thread (a Web Worker started by js/stacc-client.js): loads js/stacc-model.js and answers each
// request with GS.stacc.answer (build the assets once, then each view, filter and menu), so a large library never
// blocks the page. Messages: { id, type, ... } in, { id, result } or { id, error } out.
(function () {
  "use strict";
  importScripts("stacc-model.js");
  const memo = {};
  self.onmessage = (e) => {
    const msg = e.data || {};
    try { self.postMessage({ id: msg.id, result: self.GS.stacc.answer(memo, msg) }); }
    catch (err) { self.postMessage({ id: msg.id, error: String((err && err.message) || err) }); }
  };
})();
