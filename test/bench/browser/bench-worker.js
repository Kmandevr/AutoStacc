// Benchmark Web Worker: loads js/engine/engine-wasm.js and the engine's .wasm, reads the File with FileReaderSync.
// "inspect-share" [i, n] reads only every n-th file (the Pack Builder's way of spreading files over workers).
"use strict";
importScripts("/js/engine/engine-wasm.js");
onmessage = async ({ data }) => {
  const t = performance.now();
  const engine = await AutoStaccEngine.create(await (await fetch("/engine.wasm")).arrayBuffer());
  const out = { initMs: performance.now() - t };
  const src = engine.addSource(AutoStaccEngine.blobSource(data.file));
  for (const op of data.ops) {
    const t0 = performance.now();
    if (op === "list") out.files = engine.list(src).files.length;
    else if (op === "inspect") out.inspectSha = engine.inspect(src).files.map((f) => f.sha256).join(",").length;
    else if (op === "inspect-emit") { let b = 0; engine.inspect(src, { chunk: (c) => { b += c.length; } }); out.emittedMb = b / 1048576; }
    else if (op === "inspect-share") out.files = engine.inspect(src, null, data.share).files.length;
    out[op] = (performance.now() - t0) / 1000;
  }
  postMessage(out);
};
