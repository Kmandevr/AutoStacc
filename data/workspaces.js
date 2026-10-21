// Workspace shells (js/workspace.js; docs/studio.md): the names and order of each workspace's sections, so a rename is
// one edit here. `product` is the Product Studio (/studio#product=<id>&section=<key>, js/studio-workspace.js): `key` is
// the section in the address and the GS.studioSections module that draws it, `hint` a short line under its heading,
// `planned` sections not built yet (never shown in the sidebar). `control` is the Control Center (/admin/<page>#<key>,
// js/admin.js): `key` is the panel id (#admin-<key>); optional features switched off in data/features.js are filtered there.
window.WORKSPACES = {
  product: {
    label: "Product Studio",
    sections: [
      { key: "overview", label: "Overview", hint: "Where this product stands, what's left to do and what changed lately." },
      { key: "pacs", label: "Pac Builder", hint: "The files buyers download (this product's Pac): drop a ZIP, a folder or single files, arrange them, then publish a version." },
      { key: "store", label: "Store Page", hint: "What buyers see: name, description, cover art and details, with a live preview." },
      { key: "pricing", label: "Pricing", hint: "The price, sales and what you can expect to earn." },
      { key: "insights", label: "Insights", hint: "Orders, revenue, downloads and views for this product." },
      { key: "release", label: "Release", hint: "Check it's ready, put it on sale, pause or remove it, and see its history." }
    ],
    planned: [{ key: "team", label: "Team" }]
  },
  control: {
    label: "Control Center",
    // One sub-page per address (/admin/<id>; Stats is also plain /admin), each with its own sidebar groups. The ids
    // match server/pages/guard.js ADMIN_PAGES and the rewrites in _redirects.
    pages: [
      { id: "stats", label: "Stats", hint: "How the store is doing, and payment alerts that need a look", groups: [
        { label: "Stats", items: [
          { key: "overview", label: "Overview" },
          { key: "usage", label: "Usage and storage" }
        ] }
      ] },
      { id: "daily", label: "Daily", hint: "Orders, customers and what's waiting on you", groups: [
        { label: "Today", items: [
          { key: "orders", label: "Orders" },
          { key: "customers", label: "Customers" },
          { key: "reviews", label: "Reviews" },
          { key: "community", label: "Community reports" },
          { key: "copyright", label: "Copyright" },
          { key: "payouts", label: "Payouts" }
        ] }
      ] },
      { id: "manage", label: "Manage", hint: "Products, Pacs, promotions, news and who can sell", groups: [
        { label: "Catalog", items: [
          { key: "products", label: "Products" },
          { key: "packs", label: "Pacs" },
          { key: "promotions", label: "Promotions" },
          { key: "news", label: "News" }
        ] },
        { label: "People", items: [
          { key: "creators", label: "Creators" },
          { key: "library", label: "Community library" },
          { key: "entitlements", label: "Entitlements" }
        ] }
      ] },
      { id: "settings", label: "Settings", hint: "Store-wide switches, test purchases, paid storage and the audit log", groups: [
        { label: "Store", items: [
          { key: "switches", label: "Switches" }
        ] },
        { label: "Tools", items: [
          { key: "tests", label: "Test purchases" },
          { key: "storage-billing", label: "Paid storage" },
          { key: "audit", label: "Audit log" }
        ] }
      ] }
    ]
  }
};
