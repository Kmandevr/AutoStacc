// A creator's team (docs/builder.md, phase 7): invitations by email that only the invited address can accept, once;
// roles that separate editing, publishing, products and money (server/creators/roles.js); admins who can't touch the
// owner or other admins; members who can leave; and strangers who see nothing. Every refusal is tried, not just the
// happy path.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, outbox, linkIn, sql } from "../support/client.js";
import { newBuyer } from "../support/flows.js";

const slug = (tag) => `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const doc = (text) => ({ document: { version: 2, theme: {}, nav: { items: [] }, pages: [{ slug: "", title: "Home", sections: [{ id: "s1", rows: 6, elements: [{ id: "h1", type: "heading", text, level: 1, box: { x: 0, y: 0, w: 12, h: 3 } }] }] }] } });

async function owner(base, tag) {
  const { c, user } = await newBuyer(base, tag);
  const cr = (await c.post("/api/studio/creators", { name: `Team ${tag}`, slug: slug(tag) })).data.creator;
  const pr = (await c.post(`/api/studio/creators/${cr.id}/projects`, { name: "Album", slug: "album" })).data.project;
  return { c, user, creator: cr, project: pr };
}

// Invites a fresh account with this role and has it accept; returns its client and user.
async function join(base, o, role, tag) {
  const m = await newBuyer(base, tag);
  const sent = await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: m.user.email, role });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const token = new URL(linkIn((await outbox(base, m.user.email)).find((x) => x.kind === "creator-invite"))).hash.replace("#invite=", "");
  const ok = await m.c.post("/api/studio/invites/accept", { token });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  return m;
}

export default (ctx) => describe("creator teams", () => {
  test("an invitation works once, only for the address it was sent to, and only the token's hash is kept", async () => {
    const o = await owner(ctx.mock.url, "inv");
    const { c: invitee, user } = await newBuyer(ctx.mock.url, "inv-to");
    const { c: other } = await newBuyer(ctx.mock.url, "inv-other");
    assert.equal((await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: user.email, role: "owner" })).status, 400, "nobody is invited as owner");
    assert.equal((await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: user.email, role: "publisher" })).status, 201);
    const mail = (await outbox(ctx.mock.url, user.email)).find((x) => x.kind === "creator-invite");
    const token = new URL(linkIn(mail)).hash.replace("#invite=", "");
    assert.equal(sql(ctx.mock.stateDir, `SELECT COUNT(*) AS n FROM creator_invites WHERE token_hash = '${token}'`)[0].n, 0, "the token itself isn't stored");
    assert.equal((await new Client(ctx.mock.url).post("/api/studio/invites/accept", { token })).status, 401);
    const look = await other.post("/api/studio/invites/look", { token });
    assert.equal(look.data.forYou, false);
    assert.equal(look.data.email, undefined, "the invited address isn't shown to whoever holds the link");
    assert.equal((await other.post("/api/studio/invites/accept", { token })).data.error.code, "wrong_account");
    assert.equal((await invitee.post("/api/studio/invites/look", { token })).data.forYou, true);
    assert.equal((await invitee.post("/api/studio/invites/accept", { token })).status, 200);
    assert.equal((await invitee.post("/api/studio/invites/accept", { token })).status, 404, "used once");
    const team = (await o.c.get(`/api/studio/creators/${o.creator.id}/team`)).data;
    assert.deepEqual(team.members.map((m) => m.role), ["owner", "publisher"]);
    assert.equal((await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: user.email, role: "editor" })).data.error.code, "already_member");
    // An expired or withdrawn invitation does nothing.
    const { user: late } = await newBuyer(ctx.mock.url, "inv-late");
    await o.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: late.email, role: "editor" });
    sql(ctx.mock.stateDir, `UPDATE creator_invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE email = '${late.email}'`);
    const lateToken = new URL(linkIn((await outbox(ctx.mock.url, late.email)).find((x) => x.kind === "creator-invite"))).hash.replace("#invite=", "");
    assert.equal((await other.post("/api/studio/invites/look", { token: lateToken })).status, 404);
  });

  test("roles: editors change drafts only; publishers publish; store managers run products; only the owner sees money", async () => {
    const o = await owner(ctx.mock.url, "roles");
    const editor = await join(ctx.mock.url, o, "editor", "r-ed");
    const publisher = await join(ctx.mock.url, o, "publisher", "r-pub");
    const store = await join(ctx.mock.url, o, "store_manager", "r-store");
    const site = `/api/studio/projects/${o.project.id}`;
    assert.equal((await editor.c.req("PUT", `${site}/site`, { body: doc("By the editor") })).status, 200);
    assert.equal((await editor.c.post(`${site}/publish`, {})).status, 404, "an editor can't publish");
    assert.equal((await editor.c.req("PUT", `${site}/schedule`, { body: { at: new Date(Date.now() + 3600e3).toISOString() } })).status, 404);
    assert.equal((await editor.c.get(`/api/studio/projects/${o.project.id}/products`)).status, 404, "an editor doesn't run products");
    assert.equal((await publisher.c.post(`${site}/publish`, {})).status, 200, "a publisher publishes");
    assert.equal((await store.c.req("PUT", `${site}/site`, { body: doc("By the store manager") })).status, 404, "a store manager doesn't edit sites");
    const made = await store.c.post(`/api/studio/projects/${o.project.id}/products`, { title: "Team Kit", type: "sample-pack", priceCents: 500 });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    for (const m of [editor, publisher, store]) {
      assert.equal((await m.c.get(`/api/studio/creators/${o.creator.id}/earnings`)).status, 404, "money is the owner's");
      assert.equal((await m.c.post(`/api/studio/creators/${o.creator.id}/invites`, { email: "x@example.com", role: "editor" })).status, 404, "managing the team isn't theirs");
      assert.equal((await m.c.req("PATCH", `/api/studio/creators/${o.creator.id}`, { body: { name: "Hijack" } })).status, 404);
      const overview = (await m.c.get("/api/studio")).data.creators.find((x) => x.id === o.creator.id);
      assert.ok(overview, "members see the creator in their Studio");
    }
    const team = (await editor.c.get(`/api/studio/creators/${o.creator.id}/team`)).data;
    assert.ok(team.members.every((m) => m.email === undefined), "members who don't manage the team don't see addresses");
  });

  test("admins manage the team but never the owner or other admins; members can leave; strangers see nothing", async () => {
    const o = await owner(ctx.mock.url, "adm");
    const admin = await join(ctx.mock.url, o, "admin", "a-adm");
    const editor = await join(ctx.mock.url, o, "editor", "a-ed");
    const base = `/api/studio/creators/${o.creator.id}`;
    const { user: someone } = await newBuyer(ctx.mock.url, "a-new");
    assert.equal((await admin.c.post(`${base}/invites`, { email: someone.email, role: "admin" })).status, 403, "only the owner makes admins");
    assert.equal((await admin.c.post(`${base}/invites`, { email: someone.email, role: "publisher" })).status, 201);
    // An admin can't withdraw the owner's admin invitation.
    const { user: other } = await newBuyer(ctx.mock.url, "a-adminvite");
    assert.equal((await o.c.post(`${base}/invites`, { email: other.email, role: "admin" })).status, 201);
    const adminInvite = (await o.c.get(`${base}/team`)).data.invites.find((i) => i.email === other.email);
    assert.equal((await admin.c.req("DELETE", `${base}/invites/${adminInvite.id}`, { body: {} })).status, 403);
    assert.equal((await admin.c.req("PATCH", `${base}/members/${editor.user.id}`, { body: { role: "publisher" } })).status, 200);
    assert.equal((await admin.c.req("PATCH", `${base}/members/${editor.user.id}`, { body: { role: "admin" } })).status, 403);
    assert.equal((await admin.c.req("PATCH", `${base}/members/${o.user.id}`, { body: { role: "editor" } })).status, 403, "the owner's role never changes");
    assert.equal((await admin.c.req("DELETE", `${base}/members/${o.user.id}`, { body: {} })).status, 403);
    assert.equal((await admin.c.get(`${base}/earnings`)).status, 404, "an admin doesn't see money");
    assert.equal((await admin.c.post(`/api/studio/projects/${o.project.id}/publish`, {})).status, 409, "an admin may publish (nothing saved yet)");
    // The owner can change and remove an admin; a member can leave; the owner can't.
    assert.equal((await o.c.req("PATCH", `${base}/members/${admin.user.id}`, { body: { role: "editor" } })).status, 200);
    assert.ok(!(await o.c.get(`${base}/team`)).data.invites.some((i) => i.email === someone.email), "a demoted admin's pending invitations go");
    assert.equal((await editor.c.req("DELETE", `${base}/members/${editor.user.id}`, { body: {} })).status, 200);
    assert.equal((await editor.c.get(`${base}/team`)).status, 404, "gone after leaving");
    assert.equal((await o.c.req("DELETE", `${base}/members/${o.user.id}`, { body: {} })).status, 403);
    const { c: stranger } = await newBuyer(ctx.mock.url, "a-str");
    assert.equal((await stranger.get(`${base}/team`)).status, 404);
    assert.equal((await stranger.post(`${base}/invites`, { email: someone.email, role: "editor" })).status, 404);
  });
});
