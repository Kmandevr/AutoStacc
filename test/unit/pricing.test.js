// Cart input parsing: only well-formed product ids and whole quantities get through to pricing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItems } from "../../server/cart/pricing.js";

test("well-formed carts parse, quantity defaults to 1", () => {
  assert.deepEqual(parseItems([{ productId: "a-b" }, { productId: "c", quantity: 2 }]), [{ productId: "a-b", quantity: 1 }, { productId: "c", quantity: 2 }]);
});

test("everything else is a 400", () => {
  const bad = [undefined, null, "x", {}, [], [null], ["a"], [{ productId: "A" }], [{ productId: "a", quantity: 0 }], [{ productId: "a", quantity: 1.2 }],
    [{ productId: "a", quantity: "1" }], [{ productId: "a" }, { productId: "a" }], Array.from({ length: 21 }, (_, i) => ({ productId: "p" + i })),
    [{ productId: "a/../b" }], [{ productId: "a".repeat(81) }]];
  for (const items of bad) assert.throws(() => parseItems(items), (e) => e.status === 400, JSON.stringify(items));
});
