// Benchmark page script: runs the engine on the chosen File in one Web Worker (list, inspect, inspect handing over every
// original), then in N workers splitting the files between them, and puts the timings on window.benchResult.
"use strict";
const run = (worker, msg) => new Promise((resolve) => { worker.onmessage = (e) => resolve(e.data); worker.postMessage(msg); });
document.getElementById("pack").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  const w = new Worker("bench-worker.js");
  const one = await run(w, { file, ops: ["list", "inspect", "inspect-emit"] });
  const n = Number(new URLSearchParams(location.search).get("workers") || 4);
  const workers = Array.from({ length: n }, () => new Worker("bench-worker.js"));
  const t0 = performance.now();
  const parts = await Promise.all(workers.map((wk, i) => run(wk, { file, ops: ["inspect-share"], share: [i, n] })));
  window.benchResult = { one, parallel: { workers: n, seconds: (performance.now() - t0) / 1000, files: parts.reduce((s, p) => s + p.files, 0) } };
});
