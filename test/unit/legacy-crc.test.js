// The CRC-32 the legacy-file sweep records (server/files/legacy.js) is the ZIP one, fed in chunks.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { crc32 } from "../../server/files/legacy.js";

test("crc32 matches zlib's, whole or in chunks", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const b = crypto.randomBytes(100000);
  assert.equal(crc32(b.subarray(60000), crc32(b.subarray(0, 60000))), zlib.crc32(b) >>> 0);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});
