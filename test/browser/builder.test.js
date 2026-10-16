// Browser group for the visual builder (docs/builder.md) against its own local store: from the Studio, open the
// profile, start from a template, select and edit an element in the side panel, type into a heading on the page,
// add an element and drag it on the grid, undo and redo, switch to the phone view, publish and see the public page
// (with AutoStacc's runtime as its only script, and its motion); then a project site, its CSS refused when it reaches
// outside the page, and the editor on a phone with nothing scrolling sideways. Usage: npm run test:browser.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sql, unique, outbox, linkIn } from "../support/client.js";
import { browserStore, PHONE, DESK, settle } from "../support/browser.js";

const t = browserStore({ name: "builder", port: 8828 });
const { open, signUp } = t;
const SHOTS = process.env.BUILDER_SHOTS || "";
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }) : null);
const frame = (page) => page.frameLocator(".bx-frame");
let creatorSlug = "";

describe("the visual builder in the browser", () => {
  test("profile: template, select and edit, type on the page, add and drag, undo / redo, phone view, publish", async () => {
    const { page } = await open(DESK);
    await signUp(page, unique("builder"));
    await page.goto("/studio");
    creatorSlug = `vb-${Date.now().toString(36)}`;
    await page.fill("#cr-name", "Visual Builder");
    await page.fill("#cr-slug", creatorSlug);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.click("[data-profile]");
    await page.waitForSelector(".bx-frame");
    await settle(page);
    // A new profile opens on Add, with the templates.
    assert.equal(await page.locator('.bx-tabs [data-tab="add"]').getAttribute("aria-selected"), "true");
    await shot(page, "01-new-profile");

    page.once("dialog", (d) => d.accept());
    await page.click('[data-action="template"][data-id="artist"]');
    await frame(page).locator("text=Your artist name").waitFor();
    await settle(page);
    await shot(page, "02-artist-template");

    // Select the big heading on the page: the panel shows its fields.
    await frame(page).locator("h1.cs-h").first().click();
    await page.waitForSelector(".bx-panel-body h3:text('Heading')");
    await page.fill('.bx-panel-body input[data-path$=".text"]', "Night Shift");
    await frame(page).locator("h1.cs-h:text('Night Shift')").waitFor();
    // Double-click to type on the page itself.
    await frame(page).locator("h1.cs-h").first().dblclick();
    await page.keyboard.type("Night Shift Live");
    await page.keyboard.press("Enter");
    await frame(page).locator("h1.cs-h:text('Night Shift Live')").waitFor();
    await shot(page, "03-heading-edited");

    // Add a button to the first section and drag it to the right.
    await frame(page).locator("[data-sec]").first().click({ position: { x: 5, y: 5 } });
    await page.click('.bx-tabs [data-tab="add"]');
    await page.click('[data-action="add-element"][data-type="button"]');
    await page.waitForSelector(".bx-panel-body h3:text('Button')");
    const id = await frame(page).locator("[data-el].bx-sel").getAttribute("data-el");
    const xBefore = Number(await page.inputValue('.bx-panel-body input[data-path$=".box.x"]'));
    const button = frame(page).locator(`[data-el="${id}"]`);
    // The frame below the Studio's fixed top bar, the button in the middle of the frame (once selecting has scrolled).
    await page.waitForTimeout(500);
    await page.evaluate(() => scrollBy(0, document.querySelector(".bx-frame").getBoundingClientRect().top - 120));
    await button.evaluate((n) => n.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 300, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction((before) => Number(document.querySelector('.bx-panel-body input[data-path$=".box.x"]').value) > before, xBefore);
    const xAfter = Number(await page.inputValue('.bx-panel-body input[data-path$=".box.x"]'));
    assert.ok(xAfter > xBefore, `dragging moved it right (${xBefore} → ${xAfter})`);
    await shot(page, "04-dragged");

    // Undo puts it back, redo moves it again.
    await page.click('[data-action="undo"]');
    await frame(page).locator(`[data-el="${id}"]`).waitFor();
    assert.match(await frame(page).locator(`[data-el="${id}"]`).getAttribute("style"), new RegExp(`grid-column:${xBefore + 1} /`));
    await page.click('[data-action="redo"]');
    assert.match(await frame(page).locator(`[data-el="${id}"]`).getAttribute("style"), new RegExp(`grid-column:${xAfter + 1} /`));

    // Phone view: the frame is phone-wide and the grid is one column.
    await page.click('[data-action="device"][data-device="phone"]');
    await page.waitForFunction(() => document.querySelector(".bx-frame").getBoundingClientRect().width <= 400);
    await settle(page);
    assert.equal(await frame(page).locator(".cs-grid").first().evaluate((g) => getComputedStyle(g).display), "flex");
    await shot(page, "05-phone");
    await page.click('[data-action="device"][data-device="desktop"]');

    // Save and publish; the public profile is the design.
    await page.click('[data-action="publish"]');
    await page.waitForFunction(() => /Published|error/.test(document.querySelector(".bx-status").textContent + document.querySelector(".bx-status").className));
    assert.match(await page.locator(".bx-status").innerText(), /^Published/);
    assert.deepEqual(page.errors, []);
    const pub = await open(DESK);
    await pub.page.goto(`/${creatorSlug}`);
    await settle(pub.page);
    assert.equal(await pub.page.locator("h1.cs-h").first().innerText(), "Night Shift Live");
    assert.deepEqual(await pub.page.evaluate(() => [...document.scripts].map((s) => new URL(s.src).pathname)), ["/js/site-runtime.js"]);
    assert.equal(await pub.page.evaluate(() => document.documentElement.classList.contains("cs-fx-ready")), true, "the runtime started its motion");
    assert.deepEqual(pub.page.errors, [], "no CSP or script errors on the public page");
    await shot(pub.page, "06-public-profile");
  });

  test("project site: the CSS panel shows problems as you type and the server refuses them; good CSS styles the page", async () => {
    const { page } = await open(DESK);
    await signUp(page, unique("builder-css"));
    await page.goto("/studio");
    await page.fill("#cr-name", "CSS Creator");
    await page.fill("#cr-slug", `vbc-${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Glow");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".bx-frame");
    await page.click('.bx-tabs [data-tab="site"]');
    await page.click(".bx-group summary:text('Your CSS')");
    await page.fill('textarea[data-path="theme.css"]', "body { display: none }");
    await page.waitForSelector(".bx-css-state.error");
    await page.click('[data-action="save"]');
    await page.waitForSelector(".bx-status.error");
    await page.fill('textarea[data-path="theme.css"]', ".cs-h { color: rgb(255, 0, 0) }");
    await page.waitForSelector(".bx-css-state:text('Looks good.')");
    await page.click('[data-action="save"]');
    await page.waitForSelector(".bx-status:text('Saved.')");
    assert.equal(await frame(page).locator(".cs-h").first().evaluate((h) => getComputedStyle(h).color), "rgb(255, 0, 0)");
    const project = sql(t.stateDir, "SELECT p.id FROM projects p WHERE p.name = 'Glow'")[0];
    assert.match(sql(t.stateDir, `SELECT draft FROM project_sites WHERE project_id = '${project.id}'`)[0].draft, /cs-h/);
    assert.deepEqual(page.errors, []);
  });

  test("team: the owner invites by email from the Studio; the invitee accepts from the link and sees only what their role allows", async () => {
    const { page } = await open(DESK);
    await signUp(page, unique("team-owner"));
    await page.goto("/studio");
    await page.fill("#cr-name", "Team Creator");
    await page.fill("#cr-slug", `vbt-${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.fill("#pr-name", "Shared");
    await page.click("form[data-form=project] button[type=submit]");
    await page.waitForSelector(".bx-bar");
    await page.goto("/studio");
    await page.waitForSelector("[data-team-invite]");
    const invitee = unique("team-editor");
    await page.fill("[data-team-invite] [name=email]", invitee);
    await page.selectOption("[data-team-invite] [name=role]", "editor");
    await page.click("[data-team-invite] button[type=submit]");
    await page.waitForSelector(`.studio-team-invite:has-text("${invitee}")`);
    assert.deepEqual(page.errors, []);

    const guest = await open(DESK);
    await signUp(guest.page, invitee);
    const link = new URL(linkIn((await outbox(t.base, invitee)).find((m) => m.kind === "creator-invite")));
    await guest.page.goto(link.pathname + link.hash);
    await guest.page.click("[data-accept]");
    await guest.page.waitForSelector(".studio-creator");
    // An editor edits the site but has no Products, no project settings and no Publish.
    assert.equal(await guest.page.locator("[data-edit]").count(), 1);
    assert.equal(await guest.page.locator("[data-products]").count(), 0);
    assert.equal(await guest.page.locator("[data-team-invite]").count(), 0);
    await guest.page.click("[data-edit]");
    await guest.page.waitForSelector(".bx-bar");
    assert.equal(await guest.page.locator('[data-action="publish"]').count(), 0);
    assert.deepEqual(guest.page.errors, []);
  });

  test("community library: a trusted creator shares a section; another creator previews it and uses it", async () => {
    const seller = await open(DESK);
    await signUp(seller.page, unique("lib-seller"));
    await seller.page.goto("/studio");
    const sellerSlug = `vbl-${Date.now().toString(36)}`;
    await seller.page.fill("#cr-name", "Library Seller");
    await seller.page.fill("#cr-slug", sellerSlug);
    await seller.page.click("form[data-form=creator] button[type=submit]");
    await seller.page.waitForSelector("[data-profile]");
    sql(t.stateDir, `UPDATE creators SET trusted = 1 WHERE slug = '${sellerSlug}'`);
    await seller.page.click("[data-profile]");
    await seller.page.waitForSelector(".bx-frame");
    seller.page.once("dialog", (d) => d.accept());
    await seller.page.click('[data-action="template"][data-id="dj"]');
    await frame(seller.page).locator("text=YOUR DJ NAME").waitFor();
    await frame(seller.page).locator("[data-sec]").first().click({ position: { x: 5, y: 5 } });
    await seller.page.click('.bx-panel-body [data-action="share"][data-kind="section"]');
    await seller.page.fill("form[data-share] [name=title]", "Neon DJ banner");
    await seller.page.click("form[data-share] button[type=submit]");
    await seller.page.waitForSelector(".bx-status:text('Shared')");
    assert.deepEqual(seller.page.errors, []);

    const { page } = await open(DESK);
    await signUp(page, unique("lib-user"));
    await page.goto("/studio");
    await page.fill("#cr-name", "Library User");
    await page.fill("#cr-slug", `vblu-${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.click("[data-profile]");
    await page.waitForSelector(".bx-frame");
    await page.click('.bx-tabs [data-tab="library"]');
    const card = page.locator(".bx-pieces li", { hasText: "Neon DJ banner" });
    await card.waitFor();
    await card.locator('[data-action="lib-preview"]').click();
    await page.frameLocator(".bx-piece-frame").locator("text=YOUR DJ NAME").waitFor();
    await card.locator('[data-action="lib-use"]').click();
    await frame(page).locator("text=YOUR DJ NAME").waitFor();
    await page.waitForSelector(".bx-status:text('added')");
    assert.deepEqual(page.errors, []);
  });

  test("on a phone: the editor fits, the panel follows the page, nothing scrolls sideways", async () => {
    const { page } = await open(PHONE);
    await signUp(page, unique("builder-phone"));
    await page.goto("/studio");
    await page.fill("#cr-name", "Phone Builder");
    await page.fill("#cr-slug", `vbp-${Date.now().toString(36)}`);
    await page.click("form[data-form=creator] button[type=submit]");
    await page.click("[data-profile]");
    await page.waitForSelector(".bx-frame");
    await settle(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await shot(page, "07-phone-editor");
    assert.deepEqual(page.errors, []);
  });
});
