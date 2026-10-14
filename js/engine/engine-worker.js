// Web Worker for the Pack Builder (js/packs-preview.js): runs the engine's WebAssembly build
// (js/engine/autostacc_engine.wasm, loaded once) on a chosen ZIP without uploading it, reading it through
// FileReaderSync. Message in: { file } or { op: "list", file } lists it (only the central directory is read);
// { op: "inspect", file, part: [i, n] } checks and hashes this worker's share of its files (every n-th, from the i-th).
// Message out: { result } (the job contract's answer) or { error }.
"use strict";
importScripts("/js/engine/engine-wasm.js");

let engine = null;

onmessage = async ({ data }) => {
  try {
    if (!engine) engine = await self.AutoStaccEngine.create(await (await fetch("/js/engine/autostacc_engine.wasm")).arrayBuffer());
    const src = engine.addSource(self.AutoStaccEngine.blobSource(data.file));
    try {
      postMessage({ result: data.op === "inspect" ? engine.inspect(src, null, data.part || null) : engine.list(src) });
    } finally {
      engine.removeSource(src);
    }
  } catch (e) {
    postMessage({ error: String((e && e.message) || e) });
  }
};
