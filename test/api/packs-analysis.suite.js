// What the engine hears in audio (docs/packs.md, Phase 8): tempo and key from analysis arrive as suggestions marked
// "analysis", never sure enough to count without the creator; a waveform is kept with the stored original and in what
// customers get; silent and undecodable audio are warnings the automated review weighs, never refusals.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../support/client.js";
import { adminClient } from "../support/flows.js";
import * as P from "../support/packs.js";

const { S, caseZip, build } = P;

export default (ctx) => describe("packs: analysis", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);

  test("heard tempo and key are suggestions only; the waveform is kept; odd audio is kept and warned about", async () => {
    const { c, products } = await P.creatorWithProducts(base(), "an-heard");
    const { version } = await build(c, products[0].id, caseZip("analysis"));
    assert.equal(version.status, "ready", JSON.stringify(version));
    const v = (await c.get(`${S}/versions/${version.id}`)).data.version;
    const file = (name) => v.files.find((f) => f.filename === name);
    const loop = file("Loop B.wav");
    const heard = loop.suggestions.filter((s) => s.origin === "analysis");
    assert.deepEqual(heard.map((s) => [s.field, s.value]).sort(), [["bpm", "100"], ["key", "a-minor"]]);
    assert.ok(heard.every((s) => s.status === "suggested" && s.confidence < 0.85), "never auto-accepted");
    assert.equal(loop.resolved.bpm, undefined, "a tempo only heard doesn't count until the creator accepts it");
    assert.equal(loop.facts.peaks.length, 100);
    assert.ok(loop.facts.peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 100));
    // Kept, not refused: silence, an unknown codec, crafted headers, and Ogg Opus (not heard, not called broken). Three
    // of the eight files heard don't decode, a large share, so the review holds it (soft); one silent file doesn't.
    for (const name of ["Silence.wav", "Odd codec.wav", "Zero rate.wav", "Zero rate.aif", "Voice.ogg"]) assert.ok(file(name), name);
    assert.deepEqual(v.stats.review.flags.map((f) => [f.code, f.hard, f.count]), [["undecodable_audio", false, 3]]);
    // Accepted by the creator, it counts; publishing gives customers the waveform too.
    const ok = await c.post(`${S}/versions/${version.id}/suggestions`, { assetIds: [loop.assetId], field: "bpm", value: "100", accept: true });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    // Held for AutoStacc's review (202), then an admin approves it.
    assert.equal((await c.post(`${S}/versions/${version.id}/publish`, {})).status, 202);
    const admin = await adminClient(base());
    assert.equal((await admin.post(`/api/admin/packs/versions/${version.id}/publish`, {})).status, 200);
    const meta = JSON.parse(db(`SELECT meta FROM product_files WHERE product_id = '${products[0].id}' AND filename = 'Loop B.wav'`)[0].meta);
    assert.equal(meta.facts.peaks.length, 100);
    assert.deepEqual(meta.values.bpm, { value: "100", source: "accepted" });
  });
});
