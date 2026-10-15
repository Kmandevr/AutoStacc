// Pac editor: a small stored ZIP made in the browser from the files a creator picks (docs/packs.md, "Pac editor"), so
// one or a few files go to the store and its engine the same way a whole pack does. Entries are stored, not compressed
// (audio barely deflates; the bytes stay the creator's own), with UTF-8 names and their CRC-32 worked out here in
// chunks; folders are kept in the names ("Drums/Kick.wav"). Plain ZIP: under 4 GB in all. Sets GS.zipMake.store(files)
// → Promise<Blob>, files [{ name, blob }]; in Node, module.exports (for tests).
(function (root) {
  "use strict";

  const MAX32 = 0xffffffff;
  const CHUNK = 4 * 1024 * 1024;
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  async function crcOf(blob, onChunk) {
    let c = 0xffffffff;
    for (let at = 0; at < blob.size; at += CHUNK) {
      const bytes = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
      for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
      if (onChunk) onChunk(Math.min(CHUNK, blob.size - at));
    }
    return ~c >>> 0;
  }

  /** files: [{ name, blob }]; onProgress(fraction) while reading them. */
  async function store(files, onProgress = () => {}) {
    const enc = new TextEncoder();
    const total = files.reduce((n, f) => n + f.blob.size, 0);
    if (total + files.length * 200 >= MAX32) throw new Error("Add under 4 GB at a time.");
    let read = 0;
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name.replace(/\\/g, "/").replace(/^\/+/, ""));
      const crc = await crcOf(f.blob, (n) => onProgress((read += n) / Math.max(1, total)));
      const size = f.blob.size;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(12, 0x0021, true); // 1980-01-01: the same files give the same bytes
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      parts.push(local.buffer, name, f.blob);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(14, 0x0021, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(cd.buffer, name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    onProgress(1);
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }

  const api = { store, crcOf };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).zipMake = api;
})(typeof self !== "undefined" ? self : globalThis);
