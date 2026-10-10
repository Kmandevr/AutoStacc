// A ZIP streamed on the fly for a bundle download (docs/packs.md §8): every file stored, not compressed, so its
// original bytes pass straight from R2 to the customer; headers are written from the size and CRC-32 recorded when
// the engine checked the file, so nothing is read twice and the archive's length is known before the first byte
// (Content-Length, resumable by download managers). ZIP64 records are added only when sizes, offsets or the count
// need them. Same files in the same order give the same bytes (fixed dates), so a link can be retried safely.
const enc = new TextEncoder();
const MAX32 = 0xffffffff;
const DOS_DATE = 0x0021; // 1980-01-01: archives are byte-for-byte reproducible.

function header(size) {
  const buf = new Uint8Array(size);
  return { buf, view: new DataView(buf.buffer) };
}
const big = (view, at, n) => view.setBigUint64(at, BigInt(n), true);

/** files: [{ name, size, crc32, open: () => Promise<ReadableStream> }] → { length, stream } */
export function zipStream(files) {
  let offset = 0;
  const entries = files.map((f) => {
    const name = enc.encode(f.name);
    const z64 = f.size >= MAX32 || offset >= MAX32;
    const local = 30 + name.length + (z64 ? 20 : 0);
    const e = { ...f, nameBytes: name, z64, offset, local };
    offset += local + f.size;
    return e;
  });
  const cdStart = offset;
  const cdEntries = entries.map((e) => {
    const extra = e.size >= MAX32 || e.offset >= MAX32 ? 4 + (e.size >= MAX32 ? 16 : 0) + (e.offset >= MAX32 ? 8 : 0) : 0;
    return { e, extra, length: 46 + e.nameBytes.length + extra };
  });
  const cdSize = cdEntries.reduce((n, c) => n + c.length, 0);
  const z64End = entries.length >= 0xffff || cdStart >= MAX32 || cdSize >= MAX32;
  const length = cdStart + cdSize + (z64End ? 56 + 20 : 0) + 22;

  function localHeader(e) {
    const { buf, view } = header(e.local);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, e.z64 ? 45 : 20, true);
    view.setUint16(6, 0x0800, true); // UTF-8 names
    view.setUint16(8, 0, true); // stored
    view.setUint16(12, DOS_DATE, true);
    view.setUint32(14, e.crc32 >>> 0, true);
    view.setUint32(18, e.z64 ? MAX32 : e.size, true);
    view.setUint32(22, e.z64 ? MAX32 : e.size, true);
    view.setUint16(26, e.nameBytes.length, true);
    view.setUint16(28, e.z64 ? 20 : 0, true);
    buf.set(e.nameBytes, 30);
    if (e.z64) {
      const at = 30 + e.nameBytes.length;
      view.setUint16(at, 0x0001, true);
      view.setUint16(at + 2, 16, true);
      big(view, at + 4, e.size);
      big(view, at + 12, e.size);
    }
    return buf;
  }

  function centralDirectory() {
    const { buf, view } = header(cdSize + (z64End ? 76 : 0) + 22);
    let p = 0;
    for (const { e, extra } of cdEntries) {
      const bigSize = e.size >= MAX32;
      const bigOffset = e.offset >= MAX32;
      view.setUint32(p, 0x02014b50, true);
      view.setUint16(p + 4, 45, true);
      view.setUint16(p + 6, extra ? 45 : 20, true);
      view.setUint16(p + 8, 0x0800, true);
      view.setUint16(p + 14, DOS_DATE, true);
      view.setUint32(p + 16, e.crc32 >>> 0, true);
      view.setUint32(p + 20, bigSize ? MAX32 : e.size, true);
      view.setUint32(p + 24, bigSize ? MAX32 : e.size, true);
      view.setUint16(p + 28, e.nameBytes.length, true);
      view.setUint16(p + 30, extra, true);
      view.setUint32(p + 42, bigOffset ? MAX32 : e.offset, true);
      buf.set(e.nameBytes, p + 46);
      let x = p + 46 + e.nameBytes.length;
      if (extra) {
        view.setUint16(x, 0x0001, true);
        view.setUint16(x + 2, extra - 4, true);
        x += 4;
        if (bigSize) (big(view, x, e.size), big(view, x + 8, e.size), (x += 16));
        if (bigOffset) big(view, x, e.offset);
      }
      p += 46 + e.nameBytes.length + extra;
    }
    if (z64End) {
      view.setUint32(p, 0x06064b50, true);
      big(view, p + 4, 44);
      view.setUint16(p + 12, 45, true);
      view.setUint16(p + 14, 45, true);
      big(view, p + 24, entries.length);
      big(view, p + 32, entries.length);
      big(view, p + 40, cdSize);
      big(view, p + 48, cdStart);
      view.setUint32(p + 56, 0x07064b50, true);
      big(view, p + 64, cdStart + cdSize);
      view.setUint32(p + 72, 1, true);
      p += 76;
    }
    view.setUint32(p, 0x06054b50, true);
    view.setUint16(p + 8, Math.min(entries.length, 0xffff), true);
    view.setUint16(p + 10, Math.min(entries.length, 0xffff), true);
    view.setUint32(p + 12, Math.min(cdSize, MAX32), true);
    view.setUint32(p + 16, Math.min(cdStart, MAX32), true);
    return buf;
  }

  const { readable, writable } = new FixedLengthStream(length);
  (async () => {
    const out = writable.getWriter();
    try {
      for (const e of entries) {
        await out.write(localHeader(e));
        const body = await e.open();
        if (!body) throw new Error(`missing ${e.name}`);
        const reader = body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await out.write(value);
        }
      }
      await out.write(centralDirectory());
      await out.close();
    } catch (err) {
      await out.abort(err);
    }
  })();
  return { length, stream: readable };
}
