// Studio blocks (GS.studioBlocks, for js/studio-editor.js): what each block of a creator site is called, what it starts
// as, and its form in the editor. Every input carries data-path (where its value lives in the site document, e.g.
// "pages.0.blocks.2.text"), so the editor keeps the document in step without knowing the block types. The server
// checks everything again (server/sites/document.js); this file only makes editing pleasant. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e } = window.GS;

  const DEFS = {
    heading: { label: "Heading", blank: () => ({ text: "", level: 2 }) },
    text: { label: "Text", blank: () => ({ text: "" }) },
    image: { label: "Image", blank: () => ({ asset: "", alt: "", caption: "" }) },
    gallery: { label: "Gallery", blank: () => ({ images: [] }) },
    button: { label: "Button link", blank: () => ({ label: "", url: "" }) },
    embed: { label: "Music or video", blank: () => ({ url: "" }) },
    events: { label: "Events", blank: () => ({ title: "Upcoming", items: [] }) },
    socials: { label: "Social links", blank: () => ({ links: [] }) },
    products: { label: "Products", blank: () => ({ title: "", ids: [] }) },
    divider: { label: "Divider", blank: () => ({}) }
  };

  let uid = 0;
  const field = (label, input, hint = "") => {
    const id = `sf-${++uid}`;
    return `<div class="field"><label for="${id}">${e(label)}</label>${input(id)}${hint ? `<p class="small-print">${hint}</p>` : ""}</div>`;
  };
  const text = (label, path, value, { max = 120, placeholder = "" } = {}) =>
    field(label, (id) => `<input id="${id}" data-path="${e(path)}" maxlength="${max}" value="${e(value || "")}" placeholder="${e(placeholder)}">`);
  const area = (label, path, value, hint) =>
    field(label, (id) => `<textarea id="${id}" data-path="${e(path)}" maxlength="5000" rows="6">${e(value || "")}</textarea>`, hint);
  const select = (label, path, value, options) =>
    field(label, (id) => `<select id="${id}" data-path="${e(path)}">${options.map(([v, l]) => `<option value="${e(v)}"${String(v) === String(value) ? " selected" : ""}>${e(l)}</option>`).join("")}</select>`);
  const imageSelect = (label, path, value, ctx) => (ctx.images.length
    ? select(label, path, value, [["", "Choose an image…"], ...ctx.images.map((i) => [i.id, i.filename])])
    : `<p class="small-print">Upload an image under Images first.</p>`);
  const listTools = (path, label) => `<button class="btn ghost small" type="button" data-action="list-add" data-path="${e(path)}">${e(label)}</button>`;
  const removeItem = (path, i) => `<button class="btn ghost small" type="button" data-action="list-remove" data-path="${e(path)}" data-index="${i}">Remove</button>`;

  const FORMS = {
    heading: (b, p) => text("Heading", `${p}.text`, b.text) + select("Size", `${p}.level`, b.level, [[2, "Large"], [3, "Small"]]),
    text: (b, p) => area("Text", `${p}.text`, b.text, "Blank line = new paragraph. **bold**, *italic*, [link text](https://…)."),
    image: (b, p, ctx) => imageSelect("Image", `${p}.asset`, b.asset, ctx) + text("Description for screen readers", `${p}.alt`, b.alt, { max: 200 })
      + text("Caption (optional)", `${p}.caption`, b.caption, { max: 200 }),
    gallery: (b, p, ctx) => `${b.images.map((x, i) => `<div class="studio-item">${imageSelect(`Image ${i + 1}`, `${p}.images.${i}.asset`, x.asset, ctx)}
      ${text("Description", `${p}.images.${i}.alt`, x.alt, { max: 200 })}${removeItem(`${p}.images`, i)}</div>`).join("")}${listTools(`${p}.images`, "Add image")}`,
    button: (b, p) => text("Label", `${p}.label`, b.label, { max: 60 }) + text("Link", `${p}.url`, b.url, { max: 500, placeholder: "https://…" }),
    embed: (b, p, ctx) => field("Share link", (id) => `<input id="${id}" data-path="${e(`${p}.url`)}" maxlength="500" value="${e(b.url || "")}" placeholder="https://open.spotify.com/track/…">`,
      `From ${e(ctx.options.embeds.join(", "))}.`),
    events: (b, p) => text("Title", `${p}.title`, b.title) + b.items.map((x, i) => `<div class="studio-item">
      ${field("Date", (id) => `<input id="${id}" type="date" data-path="${e(`${p}.items.${i}.date`)}" value="${e(x.date || "")}">`)}
      ${text("What", `${p}.items.${i}.title`, x.title)}${text("Venue", `${p}.items.${i}.venue`, x.venue)}${text("City", `${p}.items.${i}.city`, x.city, { max: 80 })}
      ${text("Tickets or details link (optional)", `${p}.items.${i}.url`, x.url, { max: 500, placeholder: "https://…" })}${removeItem(`${p}.items`, i)}</div>`).join("")
      + listTools(`${p}.items`, "Add event"),
    socials: (b, p, ctx) => b.links.map((x, i) => `<div class="studio-item">${select("Network", `${p}.links.${i}.network`, x.network, ctx.options.networks.map((n) => [n, n]))}
      ${text("Profile link", `${p}.links.${i}.url`, x.url, { max: 500, placeholder: "https://…" })}${removeItem(`${p}.links`, i)}</div>`).join("") + listTools(`${p}.links`, "Add link"),
    products: (b, p, ctx) => text("Title (optional)", `${p}.title`, b.title) + (ctx.products.length
      ? `<fieldset class="studio-checks"><legend>Products to show</legend>${ctx.products.map((x) => `<label><input type="checkbox" data-path="${e(`${p}.ids`)}" data-toggle="${e(x.id)}"${b.ids.includes(x.id) ? " checked" : ""}> ${e(x.title)}</label>`).join("")}</fieldset>`
      : "<p class=\"small-print\">Your projects have no products in the AutoStacc store yet. Buyers always pay on AutoStacc, never on your page.</p>"),
    divider: () => "<p class=\"small-print\">A line between sections.</p>"
  };

  // Blank list items, by the list's key.
  const ITEMS = { images: () => ({ asset: "", alt: "" }), items: () => ({ date: "", title: "", venue: "", city: "", url: "" }), links: () => ({ network: "Website", url: "" }) };

  window.GS.studioBlocks = {
    types: Object.keys(DEFS),
    label: (type) => (DEFS[type] || { label: type }).label,
    blank: (type) => ({ type, ...DEFS[type].blank() }),
    blankItem: (listKey) => (ITEMS[listKey] ? ITEMS[listKey]() : {}),
    form: (block, path, ctx) => (FORMS[block.type] ? FORMS[block.type](block, path, ctx) : "")
  };
})();
