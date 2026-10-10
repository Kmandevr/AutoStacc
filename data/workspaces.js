// Workspace shells (js/workspace.js; docs/studio.md): the names and order of each workspace's sections, so a rename is
// one edit here. `product` is the Product Studio (/studio#product=<id>&section=<key>, js/studio-workspace.js): `key` is
// the section in the address and the GS.studioSections module that draws it, `hint` a short line under its heading,
// `planned` sections not built yet (never shown in the sidebar). `control` is the Control Center (/admin#<key>,
// js/admin.js): `key` is the panel id (#admin-<key>); optional features switched off in data/features.js are filtered there.
window.WORKSPACES = {
  product: {
    label: "Product Studio",
    sections: [
      { key: "overview", label: "Overview", hint: "Where this product stands, what's left to do and what changed lately." },
      { key: "pacs", label: "Pac Builder", hint: "The files buyers get: upload a Pac as a ZIP, or single files." },
      { key: "store", label: "Store Page", hint: "What buyers see: name, description, cover art and details, with a live preview." },
      { key: "pricing", label: "Pricing", hint: "The price, sales and what you can expect to earn." },
      { key: "insights", label: "Insights", hint: "Orders, revenue, downloads and views for this product." },
      { key: "release", label: "Release", hint: "Check it's ready, put it on sale, pause or remove it, and see its history." }
    ],
    planned: [{ key: "team", label: "Team" }]
  },
  control: {
    label: "Control Center",
    groups: [
      { label: "Store", items: [
        { key: "overview", label: "Overview" },
        { key: "products", label: "Products" },
        { key: "packs", label: "Packs" },
        { key: "promotions", label: "Promotions" },
        { key: "news", label: "News" }
      ] },
      { label: "People", items: [
        { key: "orders", label: "Orders" },
        { key: "customers", label: "Customers" },
        { key: "entitlements", label: "Entitlements" },
        { key: "creators", label: "Creators" },
        { key: "payouts", label: "Payouts" }
      ] },
      { label: "Tools", items: [
        { key: "tests", label: "Test purchases" },
        { key: "audit", label: "Audit log" }
      ] }
    ]
  }
};
