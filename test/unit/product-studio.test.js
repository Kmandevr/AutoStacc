// Product Studio rules that need no server: the readiness check (server/creators/readiness.js), the release-history
// diff of an edit (server/creators/product-history.js) and a creator sale's checks (server/promotions/creator-sales.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness } from "../../server/creators/readiness.js";
import { changeEvents } from "../../server/creators/product-history.js";
import { cleanSaleInput } from "../../server/promotions/creator-sales.js";

const product = (o = {}) => ({ id: "p", title: "Dusty Drums", description: "x".repeat(80), price_cents: 2000, artwork: "/a.png", preview: "/p.mp3",
  tags: '["drums"]', metadata: '{"includes":["40 kicks"]}', published: 0, sales_paused: 0, deleted_at: null, type: "samples", ...o });
const ok = { deliverable: true, inReview: false, creator: { status: "active" }, facets: { genre: ["house"] } };
const codes = (list) => list.map((i) => i.code);

test("a complete product is ready with nothing to recommend", () => {
  assert.deepEqual(readiness({ ...ok, product: product() }), { ready: true, blocking: [], recommended: [] });
});

test("each blocking rule, with the section that fixes it", () => {
  const r = readiness({ product: product({ title: " ", price_cents: 50 }), deliverable: false, inReview: false, creator: { status: "suspended" }, facets: {} });
  assert.equal(r.ready, false);
  assert.deepEqual(r.blocking.map((i) => [i.code, i.section]), [["no_title", "store"], ["needs_file", "pacs"], ["price_out_of_range", "pricing"], ["creator_suspended", "release"]]);
  assert.deepEqual(codes(readiness({ ...ok, deliverable: false, inReview: true, product: product() }).blocking), ["pac_in_review"]);
  assert.deepEqual(codes(readiness({ ...ok, inReview: true, product: product() }).blocking), [], "a held version doesn't block when another file is deliverable");
  for (const price of [0, 100, 50000]) assert.equal(readiness({ ...ok, product: product({ price_cents: price }) }).ready, true, String(price));
  for (const price of [99, 50001, 19.5, null]) assert.equal(readiness({ ...ok, product: product({ price_cents: price }) }).ready, false, String(price));
});

test("recommendations never block", () => {
  const r = readiness({ ...ok, facets: { genre: [] }, product: product({ description: "short", artwork: null, preview: null, tags: "[]", metadata: "{}" }) });
  assert.equal(r.ready, true);
  assert.deepEqual(codes(r.recommended), ["short_description", "no_artwork", "no_preview", "no_tags", "no_store_details", "no_includes"]);
});

test("an edit becomes the events it really caused", () => {
  const kinds = (b, a, f) => changeEvents(product(b), product(a), f).map((e) => e.kind);
  assert.deepEqual(kinds({}, { published: 1 }), ["published"]);
  assert.deepEqual(kinds({ published: 1 }, { published: 0 }), ["unpublished"]);
  assert.deepEqual(kinds({ published: 1 }, { published: 0, deleted_at: "t" }), ["removed"], "removing a product on sale is one event");
  assert.deepEqual(kinds({ deleted_at: "t" }, {}), ["restored"]);
  assert.deepEqual(kinds({}, { sales_paused: 1 }), ["paused"]);
  assert.deepEqual(kinds({ sales_paused: 1 }, {}), ["resumed"]);
  assert.deepEqual(changeEvents(product(), product({ price_cents: 1500 })), [{ kind: "price_changed", detail: { from: 2000, to: 1500 } }]);
  assert.deepEqual(changeEvents(product(), product({ title: "New", tags: '["a"]' }), { facetsBefore: { genre: ["a", "b"] }, facetsAfter: { genre: ["b"] } }),
    [{ kind: "edited", detail: { fields: ["title", "tags", "facets"] } }]);
  assert.deepEqual(changeEvents(product(), product(), { facetsBefore: { genre: ["a", "b"] }, facetsAfter: { genre: ["b", "a"], key: [] } }), [], "saving the same values records nothing");
});

test("a creator sale's checks", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const iso = (min) => new Date(now + min * 60000).toISOString();
  const bad = (body, price = 2000) => assert.throws(() => cleanSaleInput(body, price, now), (e) => e.status === 400, JSON.stringify(body));
  assert.deepEqual(cleanSaleInput({ percentOff: 25 }, 2000, now), { percentOff: 25, amountOffCents: null, startsAt: iso(0), endsAt: null });
  assert.equal(cleanSaleInput({ amountOffCents: 1999, startsAt: iso(-4) }, 2000, now).startsAt, iso(0), "a start a moment ago starts now");
  assert.equal(cleanSaleInput({ percentOff: 10, startsAt: iso(60), endsAt: iso(60 + 90 * 1440) }, 2000, now).endsAt, iso(60 + 90 * 1440));
  for (const b of [{}, { percentOff: 10, amountOffCents: 100 }, { percentOff: 0 }, { percentOff: 91 }, { percentOff: 10.5 }, { percentOff: "10" },
    { amountOffCents: 2000 }, { amountOffCents: 0 }, { percentOff: 10, startsAt: iso(-6) }, { percentOff: 10, startsAt: "tomorrow" },
    { percentOff: 10, endsAt: iso(0) }, { percentOff: 10, startsAt: iso(60), endsAt: iso(30) }, { percentOff: 10, endsAt: iso(90 * 1440 + 1) }]) bad(b);
  bad({ percentOff: 10 }, 0);
});
