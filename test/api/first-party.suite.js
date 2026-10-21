// First-party creators' owner (#172): only the verified account the FIRST_PARTY_OWNERS secret names becomes the owner
// of that catalog creator (never while impersonated, never by asking), each change is audited, whoever owned it before
// stays on the team as an admin, and owning a first-party creator doesn't use up the account's own creator.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, sql, outbox, linkIn } from "../support/client.js";
import { newBuyer, adminClient, freshAdmin } from "../support/flows.js";
import { FIRST_PARTY_OWNER } from "../support/servers.js";

const CREATOR = "autostacc";
const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const firstPartyIn = async (c) => (await c.get("/api/studio")).data.creators.find((x) => x.id === CREATOR);

export default (ctx) => describe("first-party owner", () => {
  const db = (q) => sql(ctx.mock.stateDir, q);
  const ownerRows = () => db(`SELECT user_id FROM creator_members WHERE creator_id = '${CREATOR}' AND role = 'owner'`).map((r) => r.user_id);
  const audits = () => db(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'creator.owner_assigned' AND target_id = '${CREATOR}'`)[0].n;

  test("nobody can ask for a first-party creator: the admin claim path is gone", async () => {
    const admin = await adminClient(ctx.mock.url);
    const { c } = await newBuyer(ctx.mock.url, "fp-stranger");
    for (const client of [admin, c]) {
      const overview = (await client.get("/api/studio")).data;
      assert.equal(overview.claimable, undefined);
      assert.equal(overview.creators.some((x) => x.id === CREATOR), false);
      assert.equal((await client.post(`/api/studio/creators/${CREATOR}/claim`, {})).status, 404);
    }
    assert.deepEqual(ownerRows(), []);
  });

  test("only the named account, confirmed and not impersonated, becomes the owner; the old owner stays as an admin", async () => {
    // Someone who took it through the removed claim path.
    const { c: old, user: oldUser } = await newBuyer(ctx.mock.url, "fp-old-owner");
    db(`INSERT INTO creator_members (creator_id, user_id, role, created_at) VALUES ('${CREATOR}', '${oldUser.id}', 'owner', '2026-10-20T00:00:00.000Z')`);

    // Not confirmed yet: the Studio refuses and nothing changes.
    const owner = new Client(ctx.mock.url);
    assert.equal((await owner.post("/api/auth/sign-up/email", { email: FIRST_PARTY_OWNER, password: "owner-password-123", name: "owner", callbackURL: "/studio" })).status, 200);
    assert.ok([401, 403].includes((await owner.get("/api/studio")).status));
    assert.deepEqual(ownerRows(), [oldUser.id]);
    const link = new URL(linkIn((await outbox(ctx.mock.url, FIRST_PARTY_OWNER)).find((m) => m.kind === "verify-email")));
    await owner.get(link.pathname + link.search);
    const me = (await owner.get("/api/account")).data.user;
    assert.equal(me.emailVerified, true);

    // An admin viewing the site as that account doesn't make it the owner.
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await admin.post(`/api/admin/customers/${me.id}/impersonate`, { note: "first-party owner check" })).status, 201);
    assert.equal((await admin.get("/api/studio")).status, 200);
    assert.equal(await firstPartyIn(admin), undefined);
    assert.deepEqual(ownerRows(), [oldUser.id]);
    assert.equal(audits(), 0);

    // The account itself, confirmed: owner, once, audited.
    const mine = await firstPartyIn(owner);
    assert.ok(mine, "listed for its owner");
    assert.equal(mine.firstParty, true);
    assert.equal(mine.role, "owner");
    assert.deepEqual(ownerRows(), [me.id]);
    assert.equal(audits(), 1);
    await Promise.all([owner.get("/api/studio"), owner.get("/api/studio")]);
    assert.deepEqual(ownerRows(), [me.id]);
    assert.equal(audits(), 1, "assigned once");

    // The earlier owner is a team admin now, not removed.
    assert.equal((await firstPartyIn(old)).role, "admin");
    assert.deepEqual(db(`SELECT m.role AS member, r.role AS team FROM creator_members m JOIN creator_roles r USING (creator_id, user_id)
      WHERE m.creator_id = '${CREATOR}' AND m.user_id = '${oldUser.id}'`), [{ member: "editor", team: "admin" }]);
  });

  test("owning a first-party creator doesn't count toward the account's own creator", async () => {
    const owner = new Client(ctx.mock.url);
    assert.equal((await owner.post("/api/auth/sign-in/email", { email: FIRST_PARTY_OWNER, password: "owner-password-123" })).status, 200);
    const made = await owner.post("/api/studio/creators", { name: "Owner's Own", slug: slug("fp-own") });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal((await owner.post("/api/studio/creators", { name: "One More", slug: slug("fp-more") })).data.error.code, "limit_reached");
    assert.equal((await firstPartyIn(owner)).role, "owner");
  });
});
