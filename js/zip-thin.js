// Pack Builder: a "thin" copy of a ZIP holding only some of its entries (docs/packs.md, Phase 6: a revision uploads only
// the files the store doesn't have yet). Entries are copied as they are, compressed bytes untouched (nothing is
// inflated or recompressed), with their names, methods, flags, dates and CRCs; only offsets change, and ZIP64 records
// are written where sizes or offsets need them. A data descriptor's sizes move into the headers (taken from the
// central directory). The same archive and the same entries give the same bytes. The server checks the copy exactly as
// it would the whole archive. Works on a Blob (browsers, Node 22). Sets GS.zipThin in browsers, module.exports in Node.
(function (root) {
  "use strict";

  const MAX32 = 0xffffffff;
  const MAX16 = 0xffff;
  const read = async (blob, at, length) => new DataView(await blob.slice(at, at + length).arrayBuffer());
  const big = (view, at) => Number(view.getBigUint64(at, true));

  /** The central directory: [{ index, name (Uint8Array), nameText, version, flags, method, time, date, crc, csize, usize, offset }]. */
  async function directory(blob) {
    const tailLength = Math.min(blob.size, 22 + MAX16);
    const tailStart = blob.size - tailLength;
    const tail = await read(blob, tailStart, tailLength);
    let end = -1;
    for (let i = tailLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("not a ZIP");
    let count = tail.getUint16(end + 10, true);
    let cdSize = tail.getUint32(end + 12, true);
    let cdStart = tail.getUint32(end + 16, true);
    if ((count === MAX16 || cdSize === MAX32 || cdStart === MAX32) && end >= 20 && tail.getUint32(end - 20, true) === 0x07064b50) {
      const z = await read(blob, big(tail, end - 20 + 8), 56);
      if (z.getUint32(0, true) !== 0x06064b50) throw new Error("bad ZIP64 end record");
      count = big(z, 32);
      cdSize = big(z, 40);
      cdStart = big(z, 48);
    }
    if (cdStart + cdSize > blob.size) throw new Error("directory outside the archive");
    const cd = await read(blob, cdStart, cdSize);
    const bytes = new Uint8Array(cd.buffer, cd.byteOffset, cd.byteLength);
    const out = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cdSize || cd.getUint32(p, true) !== 0x02014b50) throw new Error("bad directory entry");
      const nameLength = cd.getUint16(p + 28, true), extraLength = cd.getUint16(p + 30, true), commentLength = cd.getUint16(p + 32, true);
      const e = { index: i, version: cd.getUint16(p + 6, true), flags: cd.getUint16(p + 8, true), method: cd.getUint16(p + 10, true),
        time: cd.getUint16(p + 12, true), date: cd.getUint16(p + 14, true), crc: cd.getUint32(p + 16, true), csize: cd.getUint32(p + 20, true),
        usize: cd.getUint32(p + 24, true), offset: cd.getUint32(p + 42, true), name: bytes.slice(p + 46, p + 46 + nameLength) };
      // ZIP64 sizes and offset, in that order, for the fields that are full.
      for (let x = p + 46 + nameLength; x + 4 <= p + 46 + nameLength + extraLength;) {
        const id = cd.getUint16(x, true), len = cd.getUint16(x + 2, true);
        if (id === 0x0001) {
          let at = x + 4;
          for (const k of ["usize", "csize", "offset"]) if (e[k] === MAX32 && at + 8 <= x + 4 + len) { e[k] = big(cd, at); at += 8; }
        }
        x += 4 + len;
      }
      e.nameText = new TextDecoder().decode(e.name);
      out.push(e);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return out;
  }

  /** A new archive (a Blob) with only `keep` (entries from directory(), in the order given). */
  async function thin(blob, keep) {
    const parts = [];
    const placed = [];
    let offset = 0;
    for (const e of keep) {
      // Where its data starts: after its own local header, whose name and extra lengths may differ from the directory's.
      const lh = await read(blob, e.offset, 30);
      if (lh.getUint32(0, true) !== 0x04034b50) throw new Error("bad local header");
      const dataStart = e.offset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      if (dataStart + e.csize > blob.size) throw new Error("entry outside the archive");
      const z64 = e.usize >= MAX32 || e.csize >= MAX32;
      const head = new DataView(new ArrayBuffer(30 + e.name.length + (z64 ? 20 : 0)));
      head.setUint32(0, 0x04034b50, true);
      head.setUint16(4, z64 ? Math.max(45, e.version & 0xff) : e.version & 0xff, true);
      head.setUint16(6, e.flags & ~0x0008, true); // sizes are in the header now, no data descriptor
      head.setUint16(8, e.method, true);
      head.setUint16(10, e.time, true);
      head.setUint16(12, e.date, true);
      head.setUint32(14, e.crc, true);
      head.setUint32(18, z64 ? MAX32 : e.csize, true);
      head.setUint32(22, z64 ? MAX32 : e.usize, true);
      head.setUint16(26, e.name.length, true);
      head.setUint16(28, z64 ? 20 : 0, true);
      new Uint8Array(head.buffer).set(e.name, 30);
      if (z64) {
        const at = 30 + e.name.length;
        head.setUint16(at, 0x0001, true);
        head.setUint16(at + 2, 16, true);
        head.setBigUint64(at + 4, BigInt(e.usize), true);
        head.setBigUint64(at + 12, BigInt(e.csize), true);
      }
      parts.push(head.buffer, blob.slice(dataStart, dataStart + e.csize));
      placed.push({ e, z64, at: offset });
      offset += head.byteLength + e.csize;
    }
    const cdStart = offset;
    let cdSize = 0;
    for (const { e, z64, at } of placed) {
      const far = at >= MAX32;
      const extra = z64 || far ? 4 + (z64 ? 16 : 0) + (far ? 8 : 0) : 0;
      const c = new DataView(new ArrayBuffer(46 + e.name.length + extra));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, z64 || far ? 45 : 20, true);
      c.setUint16(6, z64 || far ? Math.max(45, e.version & 0xff) : e.version & 0xff, true);
      c.setUint16(8, e.flags & ~0x0008, true);
      c.setUint16(10, e.method, true);
      c.setUint16(12, e.time, true);
      c.setUint16(14, e.date, true);
      c.setUint32(16, e.crc, true);
      c.setUint32(20, z64 ? MAX32 : e.csize, true);
      c.setUint32(24, z64 ? MAX32 : e.usize, true);
      c.setUint16(28, e.name.length, true);
      c.setUint16(30, extra, true);
      c.setUint32(42, far ? MAX32 : at, true);
      new Uint8Array(c.buffer).set(e.name, 46);
      if (extra) {
        let x = 46 + e.name.length;
        c.setUint16(x, 0x0001, true);
        c.setUint16(x + 2, extra - 4, true);
        x += 4;
        if (z64) { c.setBigUint64(x, BigInt(e.usize), true); c.setBigUint64(x + 8, BigInt(e.csize), true); x += 16; }
        if (far) c.setBigUint64(x, BigInt(at), true);
      }
      parts.push(c.buffer);
      cdSize += c.byteLength;
    }
    const z64End = placed.length >= MAX16 || cdStart >= MAX32 || cdSize >= MAX32;
    if (z64End) {
      const z = new DataView(new ArrayBuffer(56 + 20));
      z.setUint32(0, 0x06064b50, true);
      z.setBigUint64(4, 44n, true);
      z.setUint16(12, 45, true);
      z.setUint16(14, 45, true);
      z.setBigUint64(24, BigInt(placed.length), true);
      z.setBigUint64(32, BigInt(placed.length), true);
      z.setBigUint64(40, BigInt(cdSize), true);
      z.setBigUint64(48, BigInt(cdStart), true);
      z.setUint32(56, 0x07064b50, true);
      z.setBigUint64(64, BigInt(cdStart + cdSize), true);
      z.setUint32(72, 1, true);
      parts.push(z.buffer);
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, Math.min(placed.length, MAX16), true);
    end.setUint16(10, Math.min(placed.length, MAX16), true);
    end.setUint32(12, z64End ? MAX32 : cdSize, true);
    end.setUint32(16, z64End ? MAX32 : cdStart, true);
    parts.push(end.buffer);
    return new Blob(parts, { type: "application/zip" });
  }

  const api = { directory, thin };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).zipThin = api;
})(typeof self !== "undefined" ? self : globalThis);
