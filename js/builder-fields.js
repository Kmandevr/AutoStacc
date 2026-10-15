// The visual builder's element fields (GS.builderFields; docs/builder.md): the side panel's form for each kind of
// element. Every input carries data-path (where its value lives in the site document), so the editor keeps the document
// in step without knowing the element types; lists add and remove items with data-action buttons. Pickers offer only
// the creator's own files, products and projects (the server checks again). Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;
  let uid = 0;
  const field = (label, input, hint = "") => {
    const id = `bf-${++uid}`;
    return `<div class="field"><label for="${id}">${e(label)}</label>${input(id)}${hint ? `<p class="small-print">${hint}</p>` : ""}</div>`;
  };
  const text = (label, path, value, { max = 120, placeholder = "", hint = "" } = {}) =>
    field(label, (id) => `<input id="${id}" data-path="${e(path)}" maxlength="${max}" value="${e(value || "")}" placeholder="${e(placeholder)}">`, hint);
  const area = (label, path, value, { max = 5000, rows = 6, hint = "" } = {}) =>
    field(label, (id) => `<textarea id="${id}" data-path="${e(path)}" maxlength="${max}" rows="${rows}">${e(value || "")}</textarea>`, hint);
  const select = (label, path, value, options, { number = false } = {}) =>
    field(label, (id) => `<select id="${id}" data-path="${e(path)}"${number ? " data-number" : ""}>${options.map(([v, l]) => `<option value="${e(v)}"${String(v) === String(value) ? " selected" : ""}>${e(l)}</option>`).join("")}</select>`);
  const check = (label, path, value) => { const id = `bf-${++uid}`; return `<label class="bx-check" for="${id}"><input id="${id}" type="checkbox" data-path="${e(path)}"${value ? " checked" : ""}> ${e(label)}</label>`; };
  const MARKUP = "Blank line: new paragraph. **bold**, *italic*, [label](https://link).";

  const images = (data) => data.files.filter((f) => f.contentType.startsWith("image/"));
  const imagePick = (label, path, value, data) => select(label, path, value, [["", images(data).length ? "Pick an image" : "Upload an image under Files first"], ...images(data).map((f) => [f.id, f.filename])]);

  // A list of items, each with its fields and a Remove button, plus Add.
  const list = (path, items, kind, render, addLabel, max) => `<div class="bx-list">${items.map((x, i) => `<div class="bx-item">${render(x, `${path}.${i}`)}
    <button class="btn ghost small danger" type="button" data-action="list-remove" data-path="${e(path)}" data-index="${i}">Remove</button></div>`).join("")}
    ${items.length < max ? `<button class="btn ghost small" type="button" data-action="list-add" data-path="${e(path)}" data-kind="${kind}">${e(addLabel)}</button>` : ""}</div>`;

  const BLANK_ITEM = {
    picture: () => ({ asset: "", alt: "", caption: "" }),
    event: () => ({ date: new Date().toISOString().slice(0, 10), title: "", venue: "", city: "", url: "" }),
    link: () => ({ network: "Website", url: "" }),
    panel: () => ({ title: "New", text: "" })
  };

  const FORMS = {
    heading: (b, p) => text("Words", `${p}.text`, b.text) + select("Size", `${p}.level`, b.level, [[1, "Page title (biggest)"], [2, "Heading"], [3, "Small heading"]], { number: true }),
    text: (b, p) => area("Text", `${p}.text`, b.text, { hint: MARKUP }),
    button: (b, p) => text("Label", `${p}.label`, b.label, { max: 60 }) + text("Link", `${p}.url`, b.url, { max: 500, placeholder: "https://… or /shop", hint: "A full https:// link, mailto: or an AutoStacc address." })
      + select("Look", `${p}.variant`, b.variant, [["solid", "Filled"], ["outline", "Outline"]]),
    image: (b, p, data) => imagePick("Image", `${p}.asset`, b.asset, data) + text("Description for screen readers", `${p}.alt`, b.alt, { max: 200 })
      + text("Caption", `${p}.caption`, b.caption, { max: 200 }) + select("Fit", `${p}.fit`, b.fit, [["cover", "Fill the box"], ["contain", "Show it whole"]])
      + text("Link (optional)", `${p}.url`, b.url, { max: 500 }),
    gallery: (b, p, data) => list(`${p}.images`, b.images, "picture", (x, ip) => imagePick("Image", `${ip}.asset`, x.asset, data) + text("Description", `${ip}.alt`, x.alt, { max: 200 }), "Add image", 24)
      + check("Open pictures large when clicked", `${p}.lightbox`, b.lightbox),
    slideshow: (b, p, data) => list(`${p}.images`, b.images, "picture", (x, ip) => imagePick("Image", `${ip}.asset`, x.asset, data) + text("Description", `${ip}.alt`, x.alt, { max: 200 })
      + text("Caption", `${ip}.caption`, x.caption, { max: 200 }), "Add slide", 20)
      + select("Move on by itself", `${p}.auto`, b.auto, [[0, "No"], [3, "Every 3 seconds"], [5, "Every 5 seconds"], [8, "Every 8 seconds"]], { number: true }),
    embed: (b, p, data) => text("Share link", `${p}.url`, b.url, { max: 500, placeholder: "https://open.spotify.com/…", hint: `From ${data.options.embeds.join(", ")}.` }),
    audio: (b, p, data) => {
      const withClips = data.products.filter((x) => x.preview);
      return select("Product preview", `${p}.product`, b.product, [["", withClips.length ? "Pick a product" : "None of your products has a preview clip yet"], ...withClips.map((x) => [x.id, x.title])])
        + text("Title (optional)", `${p}.title`, b.title);
    },
    events: (b, p) => text("Title", `${p}.title`, b.title) + list(`${p}.items`, b.items, "event", (x, ip) => field("Date", (id) => `<input id="${id}" type="date" data-path="${e(ip)}.date" value="${e(x.date)}">`)
      + text("What", `${ip}.title`, x.title) + text("Venue", `${ip}.venue`, x.venue) + text("City", `${ip}.city`, x.city, { max: 80 }) + text("Link (optional)", `${ip}.url`, x.url, { max: 500 }), "Add date", 50),
    tabs: (b, p) => list(`${p}.items`, b.items, "panel", (x, ip) => text("Tab name", `${ip}.title`, x.title, { max: 80 }) + area("Text", `${ip}.text`, x.text, { max: 3000, rows: 4, hint: MARKUP }), "Add tab", 12),
    accordion: (b, p) => list(`${p}.items`, b.items, "panel", (x, ip) => text("Question or title", `${ip}.title`, x.title, { max: 80 }) + area("Answer", `${ip}.text`, x.text, { max: 3000, rows: 4, hint: MARKUP }), "Add item", 12),
    countdown: (b, p) => field("Counts down to (UTC)", (id) => `<input id="${id}" type="datetime-local" data-path="${e(p)}.at" value="${e(b.at)}">`, "Visitors see it in their own time.")
      + text("Label", `${p}.label`, b.label) + text("When it's reached, show", `${p}.done`, b.done),
    socials: (b, p, data) => list(`${p}.links`, b.links, "link", (x, ip) => select("Network", `${ip}.network`, x.network, data.options.networks.map((n) => [n, n]))
      + text("Profile link", `${ip}.url`, x.url, { max: 500, placeholder: "https://…" }), "Add link", 12),
    products: (b, p, data) => text("Title", `${p}.title`, b.title) + (data.products.length
      ? `<fieldset class="bx-checks"><legend>Products to show</legend>${data.products.map((x) => { const id = `bf-${++uid}`; return `<label for="${id}"><input id="${id}" type="checkbox" data-path="${e(p)}.ids" data-toggle="${e(x.id)}"${b.ids.includes(x.id) ? " checked" : ""}> ${e(x.title)}</label>`; }).join("")}</fieldset>`
      : '<p class="small-print">Your published products appear here.</p>'),
    projects: (b, p) => text("Title", `${p}.title`, b.title) + '<p class="small-print">Shows your published projects.</p>',
    follow: (b, p, data) => select("Project", `${p}.project`, b.project, [["", "Pick a project"], ...data.projects.map((x) => [x.id, x.name + (x.published ? "" : " (not live yet)")])])
      + text("Label (optional)", `${p}.label`, b.label, { max: 60, placeholder: "Follow on AutoStacc" }) + '<p class="small-print">Opens the project on AutoStacc, where visitors follow it.</p>',
    cart: (b, p) => text("Label (optional)", `${p}.label`, b.label, { max: 60, placeholder: "Your AutoStacc cart" }),
    divider: () => "",
    spacer: () => '<p class="small-print">Give it a background colour under Style to use it as a coloured box.</p>'
  };

  const form = (el, path, data) => (FORMS[el.type] ? FORMS[el.type](el, path, data) : "");

  window.GS.builderFields = { form, field, text, area, select, check, BLANK_ITEM };
})();
