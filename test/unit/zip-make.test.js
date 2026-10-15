// The Pac editor's browser-made ZIP (js/zip-make.js): stored entries with UTF-8 names and folders, each CRC-32 right
// (the engine checks it), readable by an ordinary ZIP reader, and the same files give the same bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { entries } from "../mock-engine/server.js";

const require = createRequire(import.meta.url);
const { store, crcOf } = require("../../js/zip-make.js");

test("stored entries, names with folders, byte-identical contents, deterministic", async () => {
  const a = crypto.randomBytes(9 * 1024 * 1024 + 7), b = Buffer.from("Read me: thanks — merci.\n");
  const files = [{ name: "Drums/Kick 01.wav", blob: new Blob([a]) }, { name: "Read me.txt", blob: new Blob([b]) }];
  const zip = Buffer.from(await (await store(files)).arrayBuffer());
  const inside = entries(zip);
  assert.deepEqual([...inside.keys()], ["Drums/Kick 01.wav", "Read me.txt"]);
  assert.ok(inside.get("Drums/Kick 01.wav")().equals(a));
  assert.ok(inside.get("Read me.txt")().equals(b));
  assert.equal(await crcOf(new Blob([a])), zlib.crc32(a) >>> 0);
  assert.ok(Buffer.from(await (await store(files)).arrayBuffer()).equals(zip));
});
