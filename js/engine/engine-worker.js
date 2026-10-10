// Web Worker for the Pack Builder (js/admin-packs-preview.js): lists a chosen ZIP with the engine's WebAssembly build
// (js/engine/autostacc_engine.wasm, loaded once) without uploading or reading it whole: only the central directory is
// read, through FileReaderSync. Message in: { file }. Message out: { result } (the job contract's listing) or { error }.
"use strict";
importScripts("/js/engine/engine-wasm.js");

let engine = null;

onmessage = async ({ data }) => {
  try {
    if (!engine) engine = await self.AutoStaccEngine.create(await (await fetch("/js/engine/autostacc_engine.wasm")).arrayBuffer());
    const src = engine.addSource(self.AutoStaccEngine.blobSource(data.file));
    try {
      postMessage({ result: engine.list(src) });
    } finally {
      engine.removeSource(src);
    }
  } catch (e) {
    postMessage({ error: String((e && e.message) || e) });
  }
};
