// Guest checkout: a guest's cookie and receipt link unlock only their order; creating and verifying an account with
// the same email attaches the purchases without duplicating them; an account that never proves the email gets nothing.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, outbox, linkIn, sql, unique } from "../support/client.js";
import { mockBuy } from "../support/flows.js";

export default (ctx) => describe("guests", () => {
  test("a guest owns what they paid for on this device, nobody else does", async () => {
    const guest = new Client(ctx.mock.url);
    const email = unique("guest");
    const { orderId } = await mockBuy(guest, [{ productId: "wallpapers" }], { email });
    assert.ok(guest.jar.has("gs_guest"));
    const lib = await guest.get("/api/library");
    assert.equal(lib.status, 200);
    assert.equal(lib.data.signedIn, false);
    assert.deepEqual(lib.data.items.map((i) => i.productId), ["wallpapers"]);
    assert.equal((await guest.get(`/api/orders/${orderId}`)).data.order.status, "paid");
    const stranger = new Client(ctx.mock.url);
    assert.equal((await stranger.get(`/api/orders/${orderId}`)).status, 404);
    assert.equal((await stranger.get("/api/library")).status, 401);
  });

  test("forged and edited guest keys are ignored", async () => {
    const guest = new Client(ctx.mock.url);
    const { orderId } = await mockBuy(guest, [{ productId: "vj-loops" }], { email: unique("guest-key") });
    const real = decodeURIComponent(guest.jar.get("gs_guest"));
    const forger = new Client(ctx.mock.url);
    for (const value of [`${orderId}.${"a".repeat(52)}`, real.replace(/.$/, (ch) => (ch === "a" ? "b" : "a")), "ord_x.y", `${orderId}`]) {
      forger.jar.set("gs_guest", encodeURIComponent(value));
      assert.equal((await forger.get(`/api/orders/${orderId}`)).status, 404, value);
      assert.equal((await forger.get("/api/library")).status, 401, value);
      assert.equal((await forger.post("/api/guest/key", { key: value })).status, 404, value);
    }
  });

  test("the receipt link opens the guest's library on another device", async () => {
    const email = unique("receipt");
    await mockBuy(new Client(ctx.mock.url), [{ productId: "serum-presets" }], { email });
    const link = linkIn((await outbox(ctx.mock.url, email)).find((m) => m.kind === "purchase-confirmation" && /#key=/.test(m.body_text)));
    const key = new URLSearchParams(new URL(link).hash.slice(1)).get("key");
    const phone = new Client(ctx.mock.url);
    assert.equal((await phone.post("/api/guest/key", { key })).status, 200);
    assert.deepEqual((await phone.get("/api/library")).data.items.map((i) => i.productId), ["serum-presets"]);
  });

  test("verifying an account with the guest's email adopts the purchase, once", async () => {
    const email = unique("adopt");
    const { orderId } = await mockBuy(new Client(ctx.mock.url), [{ productId: "stems-patchwork" }], { email });
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, email);
    const lib = await c.get("/api/library");
    assert.deepEqual(lib.data.items.map((i) => i.productId), ["stems-patchwork"]);
    assert.ok((await c.get("/api/orders")).data.orders.some((o) => o.id === orderId));
    const rows = sql(ctx.mock.stateDir, `SELECT user_id FROM entitlements WHERE email = '${email}'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, user.id);
    // Buying more as a guest with the same email later goes straight to the account.
    await mockBuy(new Client(ctx.mock.url), [{ productId: "wallpapers" }], { email });
    assert.deepEqual((await c.get("/api/library")).data.items.map((i) => i.productId).sort(), ["stems-patchwork", "wallpapers"]);
  });

  test("signing up with someone else's email (never verified) gets none of their purchases", async () => {
    const email = unique("victim");
    await mockBuy(new Client(ctx.mock.url), [{ productId: "sample-pack-vol1" }], { email });
    const attacker = new Client(ctx.mock.url);
    await attacker.post("/api/auth/sign-up/email", { email, password: "attacker-password-1", name: "Mallory" });
    assert.equal((await attacker.post("/api/auth/sign-in/email", { email, password: "attacker-password-1" })).status, 403);
    assert.equal((await attacker.get("/api/library")).status, 401);
    assert.equal(sql(ctx.mock.stateDir, `SELECT user_id FROM entitlements WHERE email = '${email}'`)[0].user_id, null);
  });
});
