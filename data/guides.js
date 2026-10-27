// Guides (/guide): longer how-to articles beside the quick answers in /help (data/help.js). scripts/build.js turns this
// into /guide and one page per article, /guide/<id> (scripts/lib/guide-pages.js), plus the search index both pages use.
// Articles describe only what the site really does today (docs/guides.md); something planned isn't written up until
// it's built. Fields: sections: [{ id, title, intro }]; articles: [{ id (the address, permanent once linked), section,
// title, summary (one line, also the page's description), updated (YYYY-MM-DD), body }]. A body is a list of
// paragraphs (strings), lists ({ list: [...] }), numbered steps ({ steps: [...] }), notes ({ note: "..." }) and
// subheadings ({ heading: "...", id: "..." }, listed in the article's "On this page"). Text may use [label](/path),
// **bold** and {contact}, nothing else (scripts/lib/rich-text.js).
window.GUIDES = {
  // "Start here" at the top of /guide (owner, 2026-10-22): the guides most people need first, by id.
  start: ["buying", "your-stacc", "becoming-a-creator"],
  sections: [
    { id: "using", title: "Using AutoStacc", intro: "Buying, Your Stacc, downloads, following projects and refunds, step by step." },
    { id: "creators", title: "Creator manual", intro: "Everything in the Studio: your creator name, your sites, selling, packs, getting paid, your team and your storage." }
  ],
  articles: [
    // ---------- Using AutoStacc ----------
    {
      id: "buying", section: "using", updated: "2026-10-16",
      title: "Buying on AutoStacc",
      summary: "How a purchase works from the store to Your Stacc: carts, checkout, guest purchases, creators' products and receipts.",
      body: [
        "Everything on AutoStacc is a digital download. You pay once and the files are yours to download from [Your Stacc](/library) whenever you need them.",
        { heading: "From the store to checkout", id: "checkout" },
        { steps: [
          "Find something in the [store](/shop) or on a project's page and choose **Add to cart**. Free products have **Get it free** instead and go straight to Your Stacc.",
          "Open your [cart](/cart). The store prices everything itself, so what you see there is what you'll pay before tax.",
          "Choose **Checkout**. Payment happens on Stripe's secure page; your card details never reach AutoStacc.",
          "When you come back, the confirmation page shows your order. Your files are in Your Stacc, and a receipt is on its way by email."
        ] },
        { note: "Some bank payments are confirmed a little later. The confirmation page keeps checking on its own, and you can check an order again from [Settings › Orders](/settings/orders)." },
        { heading: "With or without an account", id: "guest" },
        "You can buy without an account. Your receipt email then has a link that opens Your Stacc for that purchase; open it on the same device if you can. With an account, everything you buy stays together in one Your Stacc, on any device. See [I bought without an account](/help#guest-purchases) if you need to bring a guest purchase into an account.",
        { heading: "Products from creators", id: "creators" },
        "Besides AutoStacc's own products, the store lists products made by creators in the Studio. Each one says who made it. Creators AutoStacc hasn't verified yet carry an **Unverified creator** label: their files are checked automatically to be what their names say, but not for quality or rights.",
        "A cart with both AutoStacc products and creators' products is paid in two steps, one group after the other. The cart explains which is which, and the other group waits in your cart.",
        { heading: "Things the store won't do", id: "safety" },
        { list: [
          "Sell you something you already own: it shows as **STACC'D** instead.",
          "Charge you twice for one press of Checkout: pressing it again opens the same order.",
          "Ask for your card number on AutoStacc itself, or on a creator's page. Payments only happen on Stripe's page."
        ] },
        "What you may do with the files depends on the kind of product: see [Licences](/license)."
      ]
    },
    {
      id: "your-stacc", section: "using", updated: "2026-10-22",
      title: "Getting around Your Stacc",
      summary: "The words Your Stacc uses, its two views, search and filters, downloading files, folders and whole Pacs, preview clips, read me files and updates.",
      body: [
        "[Your Stacc](/library) is everything you own on AutoStacc, from every project, organised by what it is rather than by order.",
        { heading: "The words you'll see", id: "words" },
        { list: [
          "**Your Stacc**: your library, everything you've Stacc'd (bought or got free), from every project.",
          "**Stacclet**: a collection of related Pacs from one project.",
          "**Pac**: a folder of content: MIDI, samples, loops, presets and more. Download one file, a selection or the whole Pac.",
          "**Auto-Stacc**: adds a followed project's free releases to Your Stacc automatically. Paid releases are shown as new, never added for you."
        ] },
        { heading: "Two views of the same files", id: "views" },
        { list: [
          "**By project**: each project, then its Stacclets and Pacs, then the files in them.",
          "**By content type**: MIDI, one-shots, loops, presets and so on, across every project, each file showing where it came from."
        ] },
        "Filter either view by project, content type or format, and type in the search box to narrow files as you type. The search, view and filters are kept in the page address, so you can bookmark a view.",
        "Products you own that don't have a file yet are listed under **On the way**.",
        { heading: "Downloading", id: "downloading" },
        { list: [
          "**Download** beside a file makes a private link just for you, valid for a few minutes. If a download stops, press it again for a new link.",
          "Tick several files (or **Select all** in a Pac or content type) and choose **Download selected** to save them one after another.",
          "Pacs built by their creator in folders show those folders. **Download folder (ZIP)** and **Download all (ZIP)** save everything in a folder or Pac as one ZIP, for 2 to 2,000 files."
        ] },
        { heading: "Previews and read me", id: "extras" },
        "A Pac can come with up to three preview clips you can play in place, and its creator's read me, folded under **Read me**.",
        { heading: "When a pack is updated", id: "updates" },
        "Creators can publish new versions of a pack. Your Stacc shows **Updated** on it. A file the update removed or replaced stays listed and downloadable for 30 days, marked with its last day, so you have time to save it."
      ]
    },
    {
      id: "collections-and-tags", section: "using", updated: "2026-10-16",
      title: "Collections, tags and saved searches",
      summary: "Organise Your Stacc your own way with collections, tags and saved searches. Only you see them.",
      body: [
        "With an account you can organise [Your Stacc](/library) your own way. Nobody else sees it, and it never changes what creators said about their files.",
        { heading: "Collections", id: "collections" },
        { steps: [
          "Tick the files you want.",
          "Under **Add to**, pick a collection, or **New collection…** and type its name, then choose **Add**.",
          "Use the **Collection** menu to see one collection. Inside it you can take files out, rename the collection or delete it; the files stay in Your Stacc."
        ] },
        "You can have up to 100 collections of up to 2,000 files each.",
        { heading: "Tags", id: "tags" },
        "Tick files, type a tag (a short word or two, up to 30 characters) and choose **Tag**. Tags show on each file with ✕ to remove one, the **Tag** menu filters by one, and search finds them. Up to 20 tags per file.",
        { heading: "Saved searches", id: "saved-searches" },
        "With a search or filter on, **Save search** keeps it as a link at the top of Your Stacc. Up to 50.",
        { heading: "When files leave", id: "leaving" },
        "Collections and tags follow a file through a pack's updates. If a file stops being yours (it was removed in an update and its 30 days passed, or the order was refunded), it isn't listed any more: the collection says how many are gone, with **Clear them**."
      ]
    },
    {
      id: "following", section: "using", updated: "2026-10-16",
      title: "Following projects and Auto-Stacc",
      summary: "What following a project does, how Auto-Stacc adds free releases for you, and what it never does.",
      body: [
        "Follow a project from [Discover](/discover?tab=projects) or any project card (you'll need an account). Its new products you don't own yet then show in Your Stacc under **New from projects you follow**.",
        { heading: "Auto-Stacc", id: "auto-stacc" },
        "Auto-Stacc is a switch on each project you follow, off until you turn it on. With it on, that project's **free** products are added to Your Stacc for you, when you follow and whenever Your Stacc opens. They show as added by Auto-Stacc.",
        { list: [
          "Paid products are never added: following never unlocks anything you'd have to buy.",
          "Unfollowing keeps everything already added."
        ] },
        { heading: "Emails", id: "emails" },
        "Whether you get emails about new releases is your choice, in [Settings](/settings). See [Will I get emails about new releases?](/help#notifications)."
      ]
    },
    {
      id: "refunds", section: "using", updated: "2026-10-16",
      title: "Refunds, step by step",
      summary: "When you can refund an order yourself, how to do it, and what happens when you can't.",
      body: [
        "You can refund an order yourself when all of these are true:",
        { list: [
          "It's a paid order, not a free one.",
          "It was paid in the last 14 days.",
          "Nothing from it has been downloaded yet.",
          "It isn't in a payment dispute with your bank."
        ] },
        { steps: [
          "Open [Settings › Orders](/settings/orders).",
          "Find the order. If it can be refunded here it shows **Refund this order** and the last day; if not, it says why.",
          "Confirm. The files leave Your Stacc and the money goes back to how you paid."
        ] },
        "Everything else, like a duplicate charge, a broken file or a purchase you didn't make, is handled by support under the [refund policy](/refunds). {contact}"
      ]
    },

    // ---------- Creator manual ----------
    {
      id: "becoming-a-creator", section: "creators", updated: "2026-10-21",
      title: "Becoming a creator",
      summary: "Claim a creator name in the Studio, start projects and understand your addresses on AutoStacc. Free, with no plan or card.",
      body: [
        "Anyone with an AutoStacc account and a confirmed email can become a creator. It's free: no plan, no card.",
        { steps: [
          "Open the [Studio](/studio).",
          "Claim your creator name. It becomes your address: autostacc.com/<your name>.",
          "Create a project for each thing you make (up to 10), then open one to build its site, add products, or add its music and events."
        ] },
        { heading: "Choosing a name", id: "names" },
        { list: [
          "3 to 40 characters: lowercase letters, numbers and single hyphens.",
          "Unique across AutoStacc. Project names only need to be unique among your own projects.",
          "Words the platform uses (like shop or studio) are reserved, and nobody can take the name of AutoStacc's own projects.",
          "One creator per account for now."
        ] },
        { heading: "Your addresses", id: "addresses" },
        { list: [
          "**/<creator>**: your profile, the one you design or else a list of your projects.",
          "**/<creator>/<project>**: a project's home page, and **/<creator>/<project>/<page>** its other pages.",
          "**/<creator>/<project>/music/<release>** and **/<creator>/<project>/events/<event>**: a release's and an event's own pages, and **/shop/<product>** a product's.",
          "Renaming a creator or project sends the old address to the new one for 90 days, and holds the old name for you so nobody can pose as you."
        ] },
        { heading: "Music and events", id: "music-events" },
        "Each project in the Studio has **Music** and **Events**. Music holds your releases (title, date, artwork, tracks, players, listening links and tags). Events holds your dates (title, day and time with its time zone, venue, city and country, a ticket link, tags and a description). Each stays a draft until you publish it. Once published, a release and an event each get their own page, and an event also appears on the public [events calendar](/events), with **Add to calendar** for visitors. Tags are up to 8 short lowercase words, the same as product tags.",
        { heading: "Being verified", id: "trusted" },
        "New creators' pages are kept out of search engines and their products carry an **Unverified creator** label until AutoStacc marks them trusted. That stops spam from riding on AutoStacc's name while giving everyone the same tools."
      ]
    },
    {
      id: "building-your-site", section: "creators", updated: "2026-10-21",
      title: "Building your site",
      summary: "The visual builder for your profile and project sites: templates, elements, sections, pages, your look, files, preview, publishing and versions.",
      body: [
        "Your profile and every project get a site you build in the visual builder, right on the page. Open it from your project in the [Studio](/studio).",
        { heading: "Start", id: "start" },
        "Pick a template or start from a blank page. Then select anything on the page to edit it: drag and resize it on the 12-column grid, type into headings, and use the side panel for its fields, style, motion and phone settings. Undo and redo are always there.",
        { heading: "Elements", id: "elements" },
        { list: [
          "Text: headings and text with **bold**, italic and links.",
          "Media: images, galleries with a lightbox, slideshows, an audio player for a product's preview clip, and music or video players from YouTube, Spotify, SoundCloud or Apple Music share links.",
          "Layout: dividers, boxes, tabs, FAQ / accordion.",
          "Your work: products, projects, a project's releases or upcoming events (from its Music and Events in the Studio; events can also be typed in), a countdown, social links, a Follow button and a cart link."
        ] },
        { heading: "Sections, pages and your look", id: "structure" },
        "Group elements into sections with their own backgrounds. A site can have up to 12 pages with a menu. Set the look once: a style preset, accent colour, a font (or upload your own WOFF2 font) and your logo. You can also add your own CSS; it's checked and kept to your page area.",
        "Use the phone view to see and adjust how every page looks on a small screen.",
        { heading: "Images and fonts", id: "files" },
        "Upload PNG, JPEG, GIF or WebP images and WOFF2 fonts. They count against your storage ([Storage and limits](/guide/storage-and-limits)). Deleting one frees its space at once, unless a published page or a kept version still uses it.",
        { heading: "Preview and publish", id: "publish" },
        { steps: [
          "Your changes save as a draft. **Preview** shows it privately; search engines never see a preview.",
          "**Publish** now, or pick a time to publish later.",
          "The last 20 publishes are kept: restore any of them. **Unpublish** takes the site offline."
        ] },
        { heading: "What creator pages can't do", id: "limits" },
        "To keep visitors safe, creator pages can't run your own HTML or JavaScript, show forms or take payments. Interactivity (slideshows, tabs, players, countdowns) comes from AutoStacc's own elements. Products, the cart and Follow link to AutoStacc's pages, where people pay. Every creator page carries a thin AutoStacc strip saying so."
      ]
    },
    {
      id: "selling", section: "creators", updated: "2026-10-21",
      title: "Selling your products",
      summary: "Create products in the Product Studio: files, store page, store details, preview clips, pricing, release, and what happens before a product goes on sale.",
      body: [
        "Each project has a **Products** page in the Studio. Create a draft there, then open it: every product has its own workspace, the Product Studio. Once published, it has its own page at **/shop/<product>**, naming you and the project.",
        { heading: "The Product Studio", id: "workspace" },
        { list: [
          "**Overview**: what's ready and what's missing before release.",
          "**Pac Builder**: the product's files (see [Uploading packs](/guide/pac-builder)).",
          "**Store Page**: the title, description, tags and preview clip buyers see. It saves as you go, with a preview.",
          "**Pricing**: free or a price.",
          "**Insights**: how this product is doing.",
          "**Release**: puts it on sale once everything it needs is in place."
        ] },
        { heading: "Store details and previews", id: "details" },
        "Store details (genre, contents, formats, DAW, plugin, key, BPM, sample rate, bit depth, only the ones that fit its kind) help people find your product in the store's filters. AutoStacc suggests some from your own words; you choose which to keep.",
        "A public preview clip can be MP3, M4A, OGG or WAV, up to 20 MB.",
        { heading: "Before it's on sale", id: "rules" },
        { list: [
          "A product needs a file to deliver, of a type the store allows.",
          "Up to 25 products per creator.",
          "Paid files from creators AutoStacc hasn't verified yet wait for a quick review before they go on sale."
        ] },
        { note: "AutoStacc keeps a fee on each sale and pays you the rest: see [Getting paid](/guide/getting-paid)." }
      ]
    },
    {
      id: "pac-builder", section: "creators", updated: "2026-10-16",
      title: "Uploading packs with the Pac Builder",
      summary: "Upload a whole pack, review what AutoStacc suggests, publish, and update it later without losing your buyers' files.",
      body: [
        "A pack of many files (a ZIP in folders) goes through the Pac Builder: open the product in the Product Studio and choose its **Pac Builder** section.",
        { steps: [
          "Drop a single file, a folder or a whole ZIP. Every file is checked to be what its name says.",
          "Review what AutoStacc suggests for each file (kind, instrument, tempo, key) and keep or change it.",
          "Arrange folders, add a read me and up to three preview clips.",
          "Publish. A clean version goes live at once; one with something flagged waits for AutoStacc's review."
        ] },
        { heading: "Updating a pack", id: "versions" },
        "Upload the new version and it's matched to the live one: unchanged and moved files keep their details, and only changed files are uploaded. Buyers keep files you removed or replaced for 30 days.",
        { heading: "Sizes", id: "sizes" },
        "One file in a Pac can be up to 4 GB. Everything counts against your storage, including replaced files during their 30 days ([Storage and limits](/guide/storage-and-limits)). A version can sometimes wait for next month's processing allowance; the Pac Builder says so when it does."
      ]
    },
    {
      id: "getting-paid", section: "creators", updated: "2026-10-16",
      title: "Getting paid",
      summary: "AutoStacc's fee, the 14-day hold, setting up your payout account with Stripe, and requesting a payout.",
      body: [
        "Your earnings and payouts are in the Studio. Only a creator's owner sees them: team members never see money.",
        { heading: "What you earn", id: "fee" },
        "AutoStacc keeps 20% of each sale (after any promo code) and you get the rest, fixed when the order is placed. Each sale is held for 14 days, the time buyers have to refund, and then becomes available.",
        { heading: "Setting up payouts", id: "account" },
        { steps: [
          "In the Studio's earnings, pick the country of your bank account and choose **Set up payouts**.",
          "Stripe asks for your ID, tax and bank details on its own page. AutoStacc never sees them.",
          "When Stripe is done, the Studio shows your payout account as ready."
        ] },
        "Payout accounts can be in the United States, the United Kingdom, the European Economic Area, Canada or Switzerland.",
        { heading: "Requesting a payout", id: "request" },
        "Once at least $10 is available, choose **Request a payout**. You can have one open request at a time; AutoStacc sends it and it shows as paid.",
        { note: "If a sale is refunded after you were paid for it, the amount comes out of your next sales before anything more is available." }
      ]
    },
    {
      id: "teams", section: "creators", updated: "2026-10-16",
      title: "Working with a team",
      summary: "Invite people to your creator with a role: Admin, Publisher, Store manager or Editor, and what each can do.",
      body: [
        "A creator's owner (or an admin) can invite people by email from the Studio's **Team** panel, up to 10 people including pending invitations.",
        { list: [
          "**Admin**: everything except money and deleting the creator.",
          "**Publisher**: edits and publishes your profile and sites.",
          "**Store manager**: products and their files, never money.",
          "**Editor**: site drafts only."
        ] },
        "An invitation works once, for 7 days, and only for the account signed in with the address it was sent to. Anyone except the owner can leave a team. Only the owner sees earnings and payouts."
      ]
    },
    {
      id: "storage-and-limits", section: "creators", updated: "2026-10-16",
      title: "Storage and limits",
      summary: "The one 550 MB storage cap for everything a creator stores, what counts against it, and the free plan's other limits.",
      body: [
        "Every creator has one free storage cap of **550 MB** for everything they store: site images and fonts, paid files and Pac previews. The Studio's meter shows how much is used.",
        { list: [
          "Deleting a file frees its space at once, unless a published page or kept version still uses it.",
          "Files a pack update replaced keep counting for the 30 days buyers can still download them.",
          "Deleted and rejected paid files keep counting until they're cleared the next day."
        ] },
        { heading: "Other limits", id: "limits" },
        { list: [
          "10 projects per creator, 12 pages per site, and the last 20 publishes kept.",
          "25 products per creator.",
          "One file in a Pac up to 4 GB."
        ] },
        "Uploads can also pause for everyone while AutoStacc's own storage is full; the Studio says so when that happens."
      ]
    }
  ]
};
