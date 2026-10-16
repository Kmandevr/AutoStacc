// Reviews from confirmed buyers (server/reviews/, issue #96): only someone who owns a product right now can rate it (1
// to 5 stars, optional text), once, editable; a review shows without a name and only while its author still owns the
// product, so a refund takes it off; AutoStacc can hide one (audited); the counts and averages are the rows'; the data
// download has them and deleting the account deletes them. Every refusal is tried.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql } from "../support/client.js";
import { adminClient, newBuyer, mockBuy, mockOutcome } from "../support/flows.js";

const PRODUCT = "stems-patchwork";
const PASSWORD = "correct-horse-battery";

export default (ctx) => describe("reviews", () => {
  const base = () => ctx.mock.url;
  const db = (q) => sql(ctx.mock.stateDir, q);
  const reviews = (c) => c.get(`/api/products/${PRODUCT}/reviews`);
  const write = (c, body) => c.req("PUT", `/api/products/${PRODUCT}/review`, { body });
  const shown = async () => (await reviews(new Client(base()))).data;

  test("only an owner may review; strangers, guests and bad values are refused", async () => {
    assert.equal((await write(new Client(base()), { rating: 5 })).status, 401);
    const { c } = await newBuyer(base(), "rv-stranger");
    const r = (await reviews(c)).data;
    assert.deepEqual([r.mine.signedIn, r.mine.canReview], [true, false]);
    assert.equal((await write(c, { rating: 5 })).data.error.code, "not_a_buyer");
    assert.equal((await c.get("/api/products/no-such-product/reviews")).status, 404);
    const buyer = await newBuyer(base(), "rv-bad");
    await mockBuy(buyer.c, [{ productId: PRODUCT }]);
    for (const rating of [0, 6, 2.5, "x", null]) assert.equal((await write(buyer.c, { rating })).status, 400, String(rating));
    assert.equal((await write(buyer.c, { rating: 4, body: "x".repeat(1001) })).status, 400);
  });

  test("a buyer's review shows without a name, counts once, edits in place, and goes with a refund", async () => {
    const before = await shown();
    const { c, user } = await newBuyer(base(), "rv-buyer");
    const order = await mockBuy(c, [{ productId: PRODUCT }]);
    assert.equal((await reviews(c)).data.mine.canReview, true);
    assert.equal((await write(c, { rating: 5, body: "Great <b>stems</b>" })).status, 200);
    assert.equal((await write(c, { rating: 3, body: "Good stems" })).status, 200, "an edit, not a second review");
    const after = await shown();
    assert.equal(after.count, before.count + 1);
    const mine = after.reviews.find((r) => r.body === "Good stems");
    assert.ok(mine && mine.rating === 3 && mine.edited);
    assert.ok(!JSON.stringify(after).includes(user.email) && !JSON.stringify(after).includes(user.name), "no name or email");
    // The average is the rows' own.
    const rows = db(`SELECT r.rating FROM product_reviews r WHERE r.product_id = '${PRODUCT}' AND r.hidden_at IS NULL`);
    if (rows.length === after.count) assert.equal(after.average, Math.round((rows.reduce((a, r) => a + r.rating, 0) / rows.length) * 10) / 10);
    // Refunded: no longer an owner, so the review isn't shown and can't be changed.
    await mockOutcome(c, order, "refunded");
    assert.equal((await shown()).count, before.count);
    assert.equal((await write(c, { rating: 1 })).data.error.code, "not_a_buyer");
    assert.equal((await c.req("DELETE", `/api/products/${PRODUCT}/review`, { body: {} })).status, 200, "deleting your own always works");
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_reviews WHERE user_id = '${user.id}'`)[0].n, 0);
  });

  test("AutoStacc hides and shows a review, audited; customers can't; creators have no route to edit it", async () => {
    const { c } = await newBuyer(base(), "rv-hide");
    await mockBuy(c, [{ productId: PRODUCT }]);
    await write(c, { rating: 1, body: "Spam spam spam" });
    const id = (await (await adminClient(base())).get("/api/admin/reviews")).data.reviews.find((r) => r.body === "Spam spam spam").id;
    assert.equal((await c.post(`/api/admin/reviews/${id}/hide`, { note: "spam" })).status, 404);
    const admin = await adminClient(base());
    assert.equal((await admin.post(`/api/admin/reviews/${id}/hide`, {})).status, 400, "a note is required");
    assert.equal((await admin.post(`/api/admin/reviews/${id}/hide`, { note: "Advertising" })).status, 200);
    assert.ok(!(await shown()).reviews.some((r) => r.id === id));
    assert.equal((await reviews(c)).data.mine.review.hidden, true, "the author is told");
    await write(c, { rating: 2, body: "Edited" });
    assert.ok(!(await shown()).reviews.some((r) => r.id === id), "an edit doesn't unhide it");
    assert.equal(db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'review.hidden' AND target_id = '${id}'`)[0].n, 1);
    assert.equal((await admin.post(`/api/admin/reviews/${id}/show`, {})).status, 200);
    assert.ok((await shown()).reviews.some((r) => r.id === id));
  });

  test("the data download has your reviews; deleting the account deletes them", async () => {
    const { c, user } = await newBuyer(base(), "rv-erase");
    await mockBuy(c, [{ productId: PRODUCT }]);
    await write(c, { rating: 4, body: "Mine" });
    const out = await c.post("/api/account/export", {});
    assert.equal(out.data.reviews.length, 1);
    assert.equal(out.data.reviews[0].text, "Mine");
    assert.equal((await c.post("/api/account/delete", { confirm: user.email, password: PASSWORD })).status, 200);
    assert.equal(db(`SELECT COUNT(*) AS n FROM product_reviews WHERE user_id = '${user.id}'`)[0].n, 0);
  });
});
