// The visual builder's side panel (GS.builderPanel; docs/builder.md): settings for what is selected (an element's
// fields, layout, style, motion and phone settings; a section's size and background), the page (name, address, its
// layers for keyboard users) and the whole site (look, header, menu, own CSS with its problems shown as you type).
// Inputs carry data-path; buttons carry data-action for js/builder.js. Needs js/util.js, js/builder-fields.js,
// js/builder-model.js and js/site-css.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  const F = () => window.GS.builderFields;
  const M = () => window.GS.builderModel;
  const btn = (action, label, extra = "", cls = "btn ghost small") => `<button class="${cls}" type="button" data-action="${action}"${extra}>${label}</button>`;
  const num = (label, path, value, min, max) => F().field(label, (id) => `<input id="${id}" type="number" inputmode="numeric" data-path="${e(path)}" data-number min="${min}" max="${max}" value="${e(value)}">`);
  const color = (label, path, value) => F().field(label, (id) => `<span class="bx-color"><input type="checkbox" aria-label="Use ${e(label.toLowerCase())}" data-action="color-toggle" data-path="${e(path)}"${value ? " checked" : ""}>
    <input id="${id}" type="color" data-path="${e(path)}" value="${e(value || "#888888")}"${value ? "" : " disabled"}></span>`);
  const classes = (path, value) => F().field("Class names (for your CSS)", (id) => `<input id="${id}" data-path="${e(path)}" data-classes value="${e((value || []).join(" "))}" placeholder="hero big-title">`,
    "Lowercase words, spaces between. Style them under Site → Your CSS.");
  const group = (title, body, open = false) => `<details class="bx-group"${open ? " open" : ""}><summary>${e(title)}</summary>${body}</details>`;
  const fileSelect = (label, path, value, files, empty) => F().select(label, path, value, [["", empty], ...files.map((f) => [f.id, f.filename])]);

  function elementPanel(el, path, data) {
    const label = (M().ELEMENTS[el.type] || {}).label || el.type;
    const s = el.style || {};
    return `<div class="bx-head"><h3>${e(label)}</h3>${btn("duplicate", "Duplicate")}${data.library.canShare ? btn("share", "Share", ` data-kind="element" data-id="${e(el.id)}"`) : ""}${btn("delete", "Delete", "", "btn ghost small danger")}</div>
      ${F().form(el, path, data)}
      ${group("Position and size", `<div class="bx-row">${num("Column (0–11)", `${path}.box.x`, el.box.x, 0, 11)}${num("Row", `${path}.box.y`, el.box.y, 0, 199)}</div>
        <div class="bx-row">${num("Width (1–12)", `${path}.box.w`, el.box.w, 1, 12)}${num("Height (rows)", `${path}.box.h`, el.box.h, 1, 100)}</div>
        <p class="small-print">Or drag it on the page, and drag its handles. Arrow keys nudge it.</p>
        <div class="bx-row">${btn("forward", "Bring forward")}${btn("backward", "Send back")}</div>`)}
      ${group("Style", `${F().select("Align", `${path}.style.align`, s.align || "", [["", "Default"], ["left", "Left"], ["center", "Centre"], ["right", "Right"]])}
        ${F().select("Text size", `${path}.style.size`, s.size || "", [["", "Default"], ["s", "Small"], ["l", "Large"], ["xl", "Extra large"], ["xxl", "Huge"]])}
        ${color("Text colour", `${path}.style.color`, s.color)}${color("Background", `${path}.style.bg`, s.bg)}
        <div class="bx-row">${num("Corner radius", `${path}.style.radius`, s.radius || 0, 0, 64)}${num("Padding", `${path}.style.pad`, s.pad || 0, 0, 96)}</div>
        ${F().check("Shadow", `${path}.style.shadow`, s.shadow)}`)}
      ${group("Motion", F().select("When it scrolls into view", `${path}.effect`, el.effect || "", [["", "Nothing"], ...data.options.effects.map((x) => [x, x.replace("-", " ")])])
        + F().select("On hover", `${path}.hover`, el.hover || "", [["", "Nothing"], ...data.options.hovers.map((x) => [x, x])])
        + '<p class="small-print">Visitors who ask for less motion see it still.</p>')}
      ${group("On phones", `${F().check("Hide on phones", `${path}.phone.hidden`, el.phone && el.phone.hidden)}
        ${num("Phone height (rows, 0 = fit)", `${path}.phone.h`, (el.phone && el.phone.h) || 0, 0, 100)}
        ${el.phone && el.phone.order !== null && el.phone.order !== undefined ? btn("phone-order-reset", "Use the desktop order on phones") : '<p class="small-print">In phone view, drag to change the order.</p>'}`)}
      ${group("Advanced", classes(`${path}.cls`, el.cls))}`;
  }

  function sectionPanel(sec, path, data) {
    const bg = sec.background || {};
    const pics = data.files.filter((f) => f.contentType.startsWith("image/"));
    return `<div class="bx-head"><h3>Section</h3>${btn("section-up", "Move up")}${btn("section-down", "Move down")}${btn("duplicate", "Duplicate")}${data.library.canShare ? btn("share", "Share", ` data-kind="section" data-id="${e(sec.id)}"`) : ""}${btn("delete", "Delete", "", "btn ghost small danger")}</div>
      ${num("Height (rows of 24px)", `${path}.rows`, sec.rows, 1, 200)}
      ${F().check("Full width (edge to edge)", `${path}.full`, sec.full)}
      ${group("Background", `${color("Colour", `${path}.background.color`, bg.color)}
        ${fileSelect("Image", `${path}.background.asset`, bg.asset, pics, pics.length ? "No image" : "Upload one under Files")}
        ${F().select("Image fit", `${path}.background.fit`, bg.fit || "cover", [["cover", "Fill"], ["contain", "Whole image"], ["tile", "Tile"]])}
        ${num("Darken the image (%)", `${path}.background.overlay`, bg.overlay || 0, 0, 90)}
        ${color("Text colour", `${path}.background.text`, bg.text)}`, true)}
      ${group("Advanced", classes(`${path}.cls`, sec.cls))}`;
  }

  function pagePanel(doc, pageIndex, data) {
    const p = doc.pages[pageIndex];
    const path = `pages.${pageIndex}`;
    const layers = p.sections.map((s, si) => `<li><button type="button" class="bx-layer" data-action="pick" data-kind="section" data-id="${e(s.id)}">Section ${si + 1}</button>
      <ul>${s.elements.map((x) => `<li><button type="button" class="bx-layer" data-action="pick" data-kind="element" data-id="${e(x.id)}">${e((M().ELEMENTS[x.type] || {}).label || x.type)}${x.text ? `: ${e(String(x.text).slice(0, 24))}` : ""}</button></li>`).join("")}</ul></li>`).join("");
    return `<div class="bx-head"><h3>Page</h3>${pageIndex ? btn("page-delete", "Delete page", "", "btn ghost small danger") : ""}</div>
      ${F().text("Page name", `${path}.title`, p.title, { max: 60 })}
      ${pageIndex ? F().text("Address", `${path}.slug`, p.slug, { max: 40, hint: `${e(data.site.path)}/<strong>${e(p.slug || "…")}</strong>` }) : `<p class="small-print">The home page, at ${e(data.site.path)}.</p>`}
      ${F().text("Description for search engines", `${path}.description`, p.description, { max: 160 })}
      ${group("Layers", `<ul class="bx-layers">${layers || "<li>Nothing here yet.</li>"}</ul>`, true)}`;
  }

  function sitePanel(doc, data) {
    const t = doc.theme;
    const fonts = data.files.filter((f) => f.contentType === "font/woff2");
    const pics = data.files.filter((f) => f.contentType.startsWith("image/"));
    const problems = window.GS.siteCss.check(t.css).problems;
    const swatches = data.options.presets.map((x) => `<label class="bx-swatch" style="--sw-bg:${e(x.bg)};--sw-fg:${e(x.text)};--sw-s:${e(x.surface)}"><input type="radio" name="bx-preset" data-path="theme.preset" value="${e(x.id)}"${x.id === t.preset ? " checked" : ""}><span>${e(x.label)}</span></label>`).join("");
    const nav = doc.nav.items.map((n, i) => `<div class="bx-item">${F().text("Label", `nav.items.${i}.label`, n.label, { max: 40 })}
      ${n.url !== undefined ? F().text("Link", `nav.items.${i}.url`, n.url, { max: 500 }) : F().select("Page", `nav.items.${i}.page`, n.page, doc.pages.map((p) => [p.slug, p.title]))}
      <div class="bx-row">${btn("nav-up", "Up", ` data-index="${i}"`)}${btn("list-remove", "Remove", ` data-path="nav.items" data-index="${i}"`, "btn ghost small danger")}</div></div>`).join("");
    return `<div class="bx-head"><h3>Site</h3>${data.library.canShare ? btn("share", "Share as a template", ' data-kind="template"') : ""}</div>
      ${group("Look", `<fieldset class="bx-swatches"><legend>Style</legend>${swatches}</fieldset>
        ${F().field("Accent colour", (id) => `<input id="${id}" type="color" data-path="theme.accent" value="${e(t.accent)}">`)}
        ${F().select("Font", "theme.font", t.font, data.options.fonts.map((f) => [f.id, f.label]))}
        ${fileSelect("Your own font (WOFF2)", "theme.fontAsset", t.fontAsset, fonts, fonts.length ? "None" : "Upload a .woff2 under Files")}`, true)}
      ${group("Header", `${F().select("Header", "theme.header", t.header, data.options.headers.map((h) => [h.id, h.label]))}
        ${fileSelect("Logo or wordmark", "theme.logo", t.logo, pics, pics.length ? "Show the name" : "Upload an image under Files")}`)}
      ${group("Menu", `<p class="small-print">${doc.nav.items.length ? "Your menu, in order." : "Empty: the menu lists every page. Add items to choose your own."}</p>${nav}
        <div class="bx-row">${doc.nav.items.length < 12 ? btn("nav-add-page", "Add a page link") + btn("nav-add-link", "Add a web link") : ""}</div>`)}
      ${group("Your CSS", `${F().area("CSS", "theme.css", t.css, { max: data.options.limits.cssBytes, rows: 12, hint: "Applies inside your page only. Your own uploads can be used with url(/media/sites/…)." })}
        <p class="bx-css-state ${problems.length ? "error" : ""}" role="status">${problems.length ? e(problems[0]) : t.css ? "Looks good." : ""}</p>`)}`;
  }

  window.GS.builderPanel = { elementPanel, sectionPanel, pagePanel, sitePanel };
})();
