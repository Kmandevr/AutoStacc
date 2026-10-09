// Newsletter sign-up (server/newsletter): double opt-in by a signed link, only for visible first-party projects, same
// answer for any address, forged or expired links refused, rate limited, and state changes only from the site.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, unique, outbox, linkIn } from "../support/client.js";
import { newBuyer } from "../support/flows.js";

export default (ctx) => describe("newsletter", () => {
  const confirmPath = (url) => new URL(url).pathname + new URL(url).search;

  test("sign-up mails a confirmation link; clicking it goes back to the project's page", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("news");
    const r = await c.post("/api/newsletter", { email, project: "glitches-and-stitches" });
    assert.equal(r.status, 200);
    const mail = (await outbox(ctx.mock.url, email)).find((m) => m.kind === "newsletter-confirm");
    assert.ok(mail, "a confirmation was mailed");
    const res = await c.get(confirmPath(linkIn(mail)));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/autostacc/glitches-and-stitches?newsletter=confirmed#newsletter");
  });

  test("forged links, unknown projects and bad input fail closed", async () => {
    const c = new Client(ctx.mock.url);
    const email = unique("forge");
    await c.post("/api/newsletter", { email, project: "glitches-and-stitches" });
    const link = linkIn((await outbox(ctx.mock.url, email)).find((m) => m.kind === "newsletter-confirm"));
    const t = new URL(link).searchParams.get("t");
    const [body, sig] = t.split(".");
    const other = Buffer.from(JSON.stringify({ e: "victim@example.com", p: "glitches-and-stitches", x: 9999999999 })).toString("base64url");
    for (const bad of [`${other}.${sig}`, `${body}.${sig}x`, "nonsense", ""]) {
      const res = await c.get(`/api/newsletter/confirm?t=${encodeURIComponent(bad)}`);
      assert.equal(res.status, 303);
      assert.match(res.headers.get("location"), /newsletter=invalid/);
    }
    assert.equal((await c.post("/api/newsletter", { email: "not-an-email", project: "glitches-and-stitches" })).status, 400);
    assert.equal((await c.post("/api/newsletter", { email: unique("x"), project: "no-such-project" })).status, 404);
    const evil = new Client(ctx.mock.url, { origin: "https://evil.example" });
    assert.equal((await evil.post("/api/newsletter", { email: unique("x"), project: "glitches-and-stitches" })).status, 403);
  });

  test("Studio projects have no newsletter", async () => {
    const { c } = await newBuyer(ctx.mock.url, "nl-creator");
    const slug = `nl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cr = await c.post("/api/studio/creators", { slug, name: "NL creator" });
    assert.ok([200, 201].includes(cr.status), JSON.stringify(cr.data));
    const pr = await c.post(`/api/studio/creators/${cr.data.creator.id}/projects`, { name: "NL project", slug: "nl-project" });
    assert.ok([200, 201].includes(pr.status), JSON.stringify(pr.data));
    assert.equal((await c.post("/api/newsletter", { email: unique("x"), project: pr.data.project.id })).status, 404);
  });
});
