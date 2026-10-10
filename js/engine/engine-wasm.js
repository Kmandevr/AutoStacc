// Loader for the AutoStacc engine's WebAssembly build (engine/, docs/engine.md). One small loader for every host: the
// Pack Builder's Web Workers (sources are Blobs read with FileReaderSync) and Node (benchmarks, tests; sources read with
// fs.readSync). No generated bindings: the engine asks for bytes through `host_read`, hands extracted originals back
// through `host_sink`, and answers each call with JSON in the job contract. Sets self.AutoStaccEngine, or module.exports.
(function (root) {
  "use strict";

  // A source is { size, read(offset, length) -> Uint8Array } and must answer synchronously (the engine waits for it).
  async function create(wasm) {
    const sources = new Map();
    let nextId = 1;
    let sink = null;
    let memory = null;
    const bytes = (ptr, len) => new Uint8Array(memory.buffer, ptr, len);
    const env = {
      host_len: (src) => (sources.has(src) ? sources.get(src).size : 0),
      host_read: (src, offset, ptr, len) => {
        const s = sources.get(src);
        if (!s) return -1;
        try {
          const chunk = s.read(offset, Math.min(len, Math.max(0, s.size - offset)));
          bytes(ptr, chunk.length).set(chunk);
          return chunk.length;
        } catch (e) {
          return -1;
        }
      },
      host_sink: (event, ptr, len) => {
        if (!sink) return;
        if (event === 0) sink.begin && sink.begin(new TextDecoder().decode(bytes(ptr, len)));
        else if (event === 1) sink.chunk && sink.chunk(bytes(ptr, len).slice());
        else sink.end && sink.end(event === 2);
      }
    };
    const { instance } = wasm instanceof WebAssembly.Module
      ? { instance: await WebAssembly.instantiate(wasm, { env }) }
      : await WebAssembly.instantiate(wasm, { env });
    const x = instance.exports;
    memory = x.memory;

    function call(request, withSink) {
      const req = new TextEncoder().encode(JSON.stringify(request));
      const ptr = x.engine_alloc(req.length);
      bytes(ptr, req.length).set(req);
      sink = withSink || null;
      try {
        const len = x.engine_call(ptr, req.length);
        return JSON.parse(new TextDecoder().decode(bytes(x.engine_result_ptr(), len)));
      } finally {
        sink = null;
        x.engine_free(ptr, req.length);
      }
    }

    return {
      addSource(source) {
        const id = nextId++;
        sources.set(id, source);
        return id;
      },
      removeSource(id) {
        sources.delete(id);
      },
      version: () => call({ op: "version" }),
      // vocabulary (optional): the words to suggest values from (server/discovery/vocabulary.js engineVocabulary()).
      list: (src, vocabulary) => call({ op: "list", src, vocabulary: vocabulary || null }),
      // part [i, n]: only this worker's share of the files (every n-th, from the i-th).
      inspect: (src, sinkCallbacks, part, vocabulary) =>
        call({ op: "inspect", src, emit: Boolean(sinkCallbacks), part: part || null, vocabulary: vocabulary || null }, sinkCallbacks),
      file: (src, path, vocabulary) => call({ op: "file", src, path, vocabulary: vocabulary || null }),
      hash: (src) => call({ op: "hash", src })
    };
  }

  // A Blob as a source, inside a Web Worker (FileReaderSync exists only there).
  function blobSource(blob) {
    const reader = new FileReaderSync();
    return { size: blob.size, read: (offset, length) => new Uint8Array(reader.readAsArrayBuffer(blob.slice(offset, offset + length))) };
  }

  const api = { create, blobSource };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AutoStaccEngine = api;
})(typeof self !== "undefined" ? self : globalThis);
