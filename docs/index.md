---
title: AutoStacc vault
summary: Vault home: links to every note.
updated: 2026-10-21
---

# AutoStacc vault

Project memory for the AutoStacc platform and its first project, Glitches & Stitches. Open this `docs/` folder as a vault in Obsidian, or read it on GitHub. A note that documents code lists the repo paths it describes in its `covers:` frontmatter; re-check the note when those change.

## Notes

- [Vision](vision.md): owner-written vision and product principles for AutoStacc (identity hierarchy, builder, store, collaboration, purchase permanence, licences, trust and safety, programs) and the open-questions register; read before planning a feature
- [Modules](modules.md): drop-in features placed by attributes, each module's options, project looks, and the single-use app roots
- [Architecture](architecture.md): AutoStacc as a platform: projects, Stacclets, Pacs, assets, Your Stacc, Auto-Stacc, polls, relationships
- [AutoStacc](autostacc.md): the platform's identity, Stacc vocabulary, site structure and look (themes, colour tokens, type)
- [Projects](projects.md): the project data contract and how to add a project
- [Creators and the Studio](creators.md): creators own projects, `/<creator>/<project>` addresses, free no-code creator sites, every creator's music and events (first-party included), the first-party owner, money and limits and how they stay safe and cheap, seller and fee per order line, file lifecycle, quotas, connected accounts
- [Your Stacc](library.md): the content-level library, selected downloads, personal collections, tags and saved searches, follows and Auto-Stacc
- [Identity](identity.md): the Glitches & Stitches project's concept, the loop, sound, visuals and personality (owner-written; follow it for anything creative)
- [Artist](artist.md): confirmed facts and what is still unknown
- [Brand](brand.md): the Glitches & Stitches skin: logo, colours, fonts, motion, sound, easter eggs and tone
- [Shop](shop.md): product kinds, products made in the Studio by every creator (the code-based catalog is retired), product pages at `/shop/<id>`, test fixtures
- [Browsing projects and content](browse.md): the projects browser, /explore, the /events calendar, the home hub, dashboard sections, Your Stacc search
- [Store discovery](discovery.md): search, filters, metadata vocabulary, recommendation scoring and its privacy rules, wishlists
- [Search and tags](search.md): the header search bar and /search, hashtags on anything, word levels for names, tags and posts
- [Processing engine](engine.md): the Rust engine (engine/): safe ZIP reading, hashes, formats, header facts, suggestions and native audio analysis (tempo, key, waveform), in a Cloudflare Container behind the engine Worker and as WebAssembly in the Pack Builder; CI and benchmarks
- [Pack Builder and processing engine](packs.md): BUILT (Phases 0–9 and the Pac editor; Phase 10 optional): packs as folders of verified assets with versions and provenance, the Rust engine in a Cloudflare Container, selective downloads, contents-derived facets, staying inside the Workers Paid plan
- [Visual builder](builder.md): phases 1–6 BUILT, roles and the community library planned: one Wix-like editor for creator profiles and project sites (free grid, templates, checked CSS, trusted interactive library, community library, roles, history, scheduling) and its build order
- [Creator pages](creator-pages.md): PLANNED / NOT IMPLEMENTED: blueprint for sandboxed creator HTML/CSS (later JavaScript) on project pages
- [Product Studio](studio.md): one workspace per product (Overview, Pac Builder, Store Page, Pricing, Insights, Release) in a shared shell the Control Center also uses; names, data ownership, API contracts, built vs planned
- [Guides and creator manual](guides.md): PLANNED: long-form support articles at /guide beside /help, with a full Studio manual
- [Community](community.md): PLANNED: spaces for AutoStacc, projects and user-made communities (each creator's Community page, where news and event announcements will live), with channels; discussions, Q&A, updates, polls and challenges; upvotes; base rules plus stricter local rules; moderation, 16+, build order
- [Copyright](copyright.md): notices and strikes as built: the uploader and the creator space, levels, what two strikes stop, the next steps
- [Community safety](community-safety.md): PLANNED: legal and security for the community: launch gates (legal setup, DMCA agent, CSAM scanning), copyright strikes, UK/EU duties, contests, urgent reports, retention, security rules
- [Profiles, points and friends](profiles.md): PLANNED: Steam-style profiles, points spent on profile items creators make, friends, a friends-only feed, collab requests
- [Store](store.md): how the store works (architecture, accounts, payments, entitlements, downloads, email, admin, security)
- [Control Center](admin.md): the owner's admin: statistics and their sources, sales and promo codes, customer preview, support impersonation, test purchases, audit log
- [Store setup](store-setup.md): the owner's checklist to switch the store on (Cloudflare, Stripe, Brevo, secrets)
- [Payouts setup](payouts-setup.md): how creators are paid (Stripe Connect on a second Stripe account) and what to set up to switch it on
- [Development](development.md): running locally in test mode, environment variables, tests, the docs guard, security tooling (CodeQL, Dependabot, CODEOWNERS), extending the store
- [SEO](seo.md): how search visibility works (generated metadata, server-rendered product, release and event pages, sitemaps, llms.txt, structured data, tests)
- [Search Console](search-console.md): the owner's step-by-step for Google Search Console and official profiles
- [Production requirements](production.md): trust pages, licences, support, uploads, privacy, security, accessibility and SEO rules every change must keep
- [Decisions](decisions.md): what was chosen and why
- [Log](log.md): dated history of changes
