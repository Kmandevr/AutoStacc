// The visual builder's pure parts (docs/builder.md): the version 2 document (grid boxes, sections, elements, phone
// settings, menu), the CSS checker that keeps creators' styles inside their page, the templates, the shared renderer
// (grid placement, phone order, nothing a creator typed in an attribute or a style) and the file sniffing for fonts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDocument, starterDocument } from "../../server/sites/document.js";
import { checkCss } from "../../server/sites/css.js";
import { TEMPLATES } from "../../server/sites/templates.js";
import { sniffFile, sniffImage } from "../../server/sites/images.js";
import siteRender from "../../js/site-render.js";
import builderModel from "../../js/builder-model.js";
import siteElements from "../../js/site-elements.js";
import { ELEMENT_TYPES } from "../../server/sites/elements.js";

const A = (c) => "as_" + c.repeat(26);
const ctx = (over = {}) => ({ images: new Map(), products: new Map(), projects: new Map(), ...over });
const doc = (sections, extra = {}) => ({ version: 2, theme: {}, pages: [{ slug: "", title: "Home", sections }], ...extra });
const render = (d, c = ctx()) => siteRender.pageHtml({ siteUrl: "https://autostacc.com", path: "/me", title: "T", doc: d, page: d.pages[0], ctx: c, header: { base: "/me", name: "Me", by: null }, runtime: null });

test("grid boxes are clamped to the 12 columns; ids are kept or made; unknown fields dropped", () => {
  const { doc: d } = cleanDocument(doc([{ id: "s1", rows: 9999, elements: [
    { id: "e1", type: "heading", text: "Hi", box: { x: 10, y: -3, w: 6, h: 0 }, evil: "<script>" },
    { id: "e1", type: "text", text: "dup id", box: { x: 0, y: 2, w: 12, h: 4 } }
  ] }]));
  const [s] = d.pages[0].sections;
  assert.equal(s.rows, 200);
  assert.deepEqual(s.elements[0].box, { x: 6, y: 0, w: 6, h: 1 });
  assert.equal(s.elements[0].evil, undefined);
  assert.notEqual(s.elements[1].id, "e1", "a repeated id gets a new one");
});

test("styles, effects and phone settings accept only known values", () => {
  const { doc: d } = cleanDocument(doc([{ elements: [{ type: "text", text: "x", box: { x: 0, y: 0, w: 4, h: 2 },
    style: { color: "red;}body{x", bg: "#ABCDEF", align: "justify", radius: 999, size: "huge" }, effect: "explode", hover: "glow",
    phone: { hidden: "yes", order: 3, h: 500 }, cls: ["hero", "cs-strip", "Bad Class", "x".repeat(40)] }] }]));
  const el = d.pages[0].sections[0].elements[0];
  assert.equal(el.style.color, "");
  assert.equal(el.style.bg, "#abcdef");
  assert.equal(el.style.align, "");
  assert.equal(el.style.radius, 64);
  assert.equal(el.style.size, "");
  assert.equal(el.effect, "");
  assert.equal(el.hover, "glow");
  assert.deepEqual(el.phone, { hidden: false, order: 3, h: 100 });
  assert.deepEqual(el.cls, ["hero"], "AutoStacc's own class names and odd ones are dropped");
});

test("every element type is checked: links, embeds, dates, products and projects", () => {
  const bad = (el, re) => assert.throws(() => cleanDocument(doc([{ elements: [{ box: { x: 0, y: 0, w: 12, h: 2 }, ...el }] }])), re);
  bad({ type: "button", label: "x", url: "javascript:alert(1)" }, /use a full https/);
  bad({ type: "embed", url: "https://evil.example/x" }, /share link/);
  bad({ type: "countdown", at: "tomorrow" }, /pick a date and time/);
  bad({ type: "audio", product: "../x" }, /pick one of your products/);
  bad({ type: "follow", project: "a b" }, /pick one of your projects/);
  bad({ type: "slideshow", images: [{ asset: "nope" }] }, /pick an uploaded image/);
  bad({ type: "tabs", items: [{ text: "no title" }] }, /required/);
  const { products, projects, assets } = cleanDocument(doc([{ elements: [
    { type: "audio", product: "my-pack", box: { x: 0, y: 0, w: 6, h: 3 } },
    { type: "follow", project: "prj_abc", box: { x: 6, y: 0, w: 6, h: 2 } },
    { type: "slideshow", images: [{ asset: A("d"), alt: "", caption: "c" }], auto: 99, box: { x: 0, y: 4, w: 12, h: 10 } }
  ], background: { asset: A("e"), overlay: 200 } }]));
  assert.deepEqual([...products], ["my-pack"]);
  assert.deepEqual([...projects], ["prj_abc"]);
  assert.deepEqual([...assets].sort(), [A("d"), A("e")].sort());
});

test("the menu points only at the site's own pages or safe links", () => {
  const pages = [{ slug: "", title: "Home", sections: [] }, { slug: "tour", title: "Tour", sections: [] }];
  assert.throws(() => cleanDocument({ version: 2, pages, nav: { items: [{ label: "Gone", page: "nope" }] } }), /pick one of this site's pages/);
  assert.throws(() => cleanDocument({ version: 2, pages, nav: { items: [{ label: "X", url: "javascript:x" }] } }), /https/);
  const { doc: d } = cleanDocument({ version: 2, pages, nav: { items: [{ label: "Dates", page: "tour" }, { label: "Shop", url: "/shop" }] } });
  const html = render(d);
  assert.match(html, /<a href="\/me\/tour">Dates<\/a><a href="\/shop">Shop<\/a>/);
});

test("a page can't take the address of the project's community space", () => {
  const pages = [{ slug: "", title: "Home", sections: [] }, { slug: "community", title: "Community", sections: [] }];
  assert.throws(() => cleanDocument({ version: 2, pages }), /community space/);
});

test("CSS stays inside the page: scoped, rebuilt, and refused when it could reach out or load anything", () => {
  const ok = checkCss(`.hero { color: red; background: url(/media/sites/${A("f")}) } @media (max-width: 600px) { h1 { font-size: 2rem } }`);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.css, `.cs-site .hero{color:red;background:url("/media/sites/${A("f")}")}@media (max-width: 600px){.cs-site h1{font-size:2rem}}`);
  assert.deepEqual([...ok.assets], [A("f")]);
  for (const evil of ["body{display:none}", ":root{--bg:red}", "html .x{a:b}", "~ .cs-footer{display:none}", ".cs-site:hover ~ .cs-footer{x:y}", "+ .x{a:b}",
    ".a{background:url(https://evil.example/x.png)}", "@import url(x.css);", "@font-face{font-family:x}", ".a{width:expression(alert(1))}",
    ".a{behavior:url(x.htc)}", ".a{-moz-binding:url(x)}", ".a{color:red}</style><script>alert(1)</script>", ".a{b:\\75 rl(x)}",
    ".a{& .b{c:d}}", ".a{background:image-set('x.png' 1x)}", "@keyframes cs-spin{from{a:b}}", ".a{color:red", "@namespace x url(y);",
    // Found in review: brackets that read differently in the browser, and switching off the page area's containment.
    ":is(.a ,{}) , .cs-footer{color:red}", ":is(.a ,{}) , .cs-strip{display:none}", ".cs-site{contain:none;position:fixed;inset:0;z-index:9}",
    ":not(.cs-site) .x{a:b}", ".bx-h{display:none}", ".a)(.b{x:y}", ".a{b:(} .cs-footer{color:red}", ".a{content:\"x\n}", "@media (min-width:1px{.a{b:c}}"]) {
    const r = checkCss(evil);
    assert.ok(r.problems.length, evil);
    assert.equal(r.css, "", evil);
  }
});

test("a sheet with problems shows nothing on the page; a file that isn't the creator's is dropped from good CSS", () => {
  const good = doc([], { theme: { css: `.a{background:url(/media/sites/${A("g")})}` } });
  const html = render(cleanDocument(good).doc);
  assert.match(html, /<style>\.cs-site \.a\{background:none\}<\/style>/);
  assert.throws(() => cleanDocument(doc([], { theme: { css: "body{x:y}" } })), /theme\.css/);
});

test("the renderer places elements on the grid, orders phones top to bottom, and puts nothing typed into attributes", () => {
  const { doc: d } = cleanDocument(doc([{ id: "s1", rows: 6, elements: [
    { id: "b", type: "heading", text: "Right \" onmouseover=\"x", box: { x: 6, y: 0, w: 6, h: 2 } },
    { id: "a", type: "heading", text: "Left", box: { x: 0, y: 0, w: 6, h: 2 } },
    { id: "c", type: "text", text: "Below", box: { x: 0, y: 3, w: 12, h: 2 }, phone: { order: 0, hidden: true } }
  ] }]));
  const html = render(d);
  assert.match(html, /data-el="b" style="grid-column:7 \/ span 6;grid-row:1 \/ span 2;--po:1"/);
  assert.match(html, /data-el="a" style="grid-column:1 \/ span 6;grid-row:1 \/ span 2;--po:0"/);
  assert.match(html, /class="cs-el cs-t-text cs-ph-hide" data-el="c" style="[^"]*--po:0"/);
  assert.match(html, /Right &quot; onmouseover=&quot;x/);
  assert.ok(!/onmouseover="/.test(html));
});

test("version 1 documents convert to one stacked section per page", () => {
  const { doc: d } = cleanDocument({ theme: { preset: "paper" }, pages: [{ title: "Home", blocks: [{ type: "heading", text: "Hi" }, { type: "divider" }, { type: "text", text: "Body" }] }] });
  assert.deepEqual(d.pages[0].sections[0].elements.map((e) => [e.type, e.box.y, e.box.w]), [["heading", 0, 12], ["divider", 4, 12], ["text", 6, 12]]);
  assert.equal(d.theme.preset, "paper");
});

test("the templates and starters are valid documents with placeholder words and no files", () => {
  assert.deepEqual(TEMPLATES.map((t) => t.id), ["artist", "dj", "packs", "label"]);
  for (const t of TEMPLATES) {
    const { doc: d, assets, products } = cleanDocument(t.doc);
    assert.ok(d.pages.length >= 1 && d.pages[0].sections.length >= 2, t.id);
    assert.equal(assets.size + products.size, 0, `${t.id} uses no files or products`);
    assert.ok(render(d).includes("cs-sec"), t.id);
  }
  assert.equal(starterDocument("Me", { profile: true }).pages[0].sections[0].elements[1].type, "projects");
});

test("fonts are recognised by their bytes (a whole WOFF2 header) and never pass as images", () => {
  const woff2 = new Uint8Array(64);
  woff2.set([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 64]);
  assert.equal(sniffFile(woff2).type, "font/woff2");
  assert.equal(sniffFile(Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 0])), null, "a bare signature isn't a font");
  const lying = woff2.slice();
  lying[11] = 99;
  assert.equal(sniffFile(lying), null, "the header's length must be the file's");
  assert.equal(sniffImage(woff2), null);
  assert.equal(sniffFile(new TextEncoder().encode("wOFF........")), null, "WOFF 1 isn't accepted");
});

test("the Add panel's elements are the server's and the renderer's; Releases and project Events show a placeholder in the editor", () => {
  assert.deepEqual(Object.keys(builderModel.ELEMENTS).sort(), [...ELEMENT_TYPES].sort());
  for (const t of ELEMENT_TYPES) assert.ok(siteElements.TYPES.includes(t), t);
  const editor = ctx({ editor: true, projects: new Map([["p1", { name: "Mine", path: "/me/mine" }]]) });
  assert.match(siteElements.render({ type: "releases", project: "p1", count: 4 }, editor), /cs-empty">Newest releases from Mine/);
  assert.match(siteElements.render({ type: "events", project: "p1", items: [] }, editor), /Upcoming events from Mine/);
  assert.equal(siteElements.render({ type: "releases", project: "p1", count: 4 }, ctx()), "", "nothing for a project that isn't live");
});
