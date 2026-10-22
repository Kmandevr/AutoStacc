---
title: Guides and creator manual
summary: BUILT (2026-10-16, issue #134): long-form support articles at /guide beside the quick answers in /help, with a creator manual for the Studio; static pages generated from data/guides.js, one search across guides and help.
covers: [data/guides.js, data/guide-index.js, scripts/lib/guide-pages.js, js/guide-search.js, css/guide.css]
updated: 2026-10-22
---

# Guides and creator manual

> **BUILT 2026-10-16** (issue #134); articles checked against the code that day. Decided with the owner on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). The forum planned at the same time is [community](community.md).

## What the owner chose

- A support "wiki" that **only AutoStacc writes**, not a wiki users can edit (users talk in the [community forum](community.md) instead).
- It covers both customers **and creators**: a full Studio/creator manual is its own section.
- Support tickets were not chosen; `/contact` stays the way to reach a person.

## Shape

- **`/help` stays** as the quick-answer page (`data/help.js`). Answers link to an article when there's more to say.
- **`/guide`** is the guide home: two sections, then articles at `/guide/<slug>`.
  - *Using AutoStacc*: buying and checkout, Your Stacc and downloads, collections and tags, following and Auto-Stacc, accounts and security, refunds, licences in plain words.
  - *Creator manual*: becoming a creator, your profile and projects, the visual builder (sections, grid, templates, checked CSS, fonts, versions, scheduling), the Pac Builder, products and pricing, the store page, payouts, team roles, storage and limits, what creators may and may not upload.
- **Content is data.** `data/guides.js` holds sections and articles (id, title, summary, section, updated, body), using the same safe text as `data/help.js` (paragraphs, lists, `[label](/path)`, `**bold**`), plus headings, numbered steps and notes. No HTML in data.
- **Generated, static pages.** `scripts/build.js` writes `guide.html` and `guide/<slug>.html` with the usual head (canonical, Open Graph, breadcrumbs JSON-LD; `TechArticle` where it fits) and adds them to `sitemap.xml`. No API, no D1.
- **Search.** A small generated index of help answers and article headings, searched in the browser on `/help` and `/guide`.
- **Links in.** `/contact` points to the guide first; the Studio's panels get a "?" link to the matching manual article.

## What's built

- `scripts/lib/guide-pages.js` writes `guide.html` (`/guide`) and `guide/<id>.html`; `scripts/dist.js` ships `guide/`; sitemap and `llms.txt` list them. The build refuses bad ids, unknown sections, missing titles or summaries, bad dates and duplicate heading ids.
- `scripts/lib/rich-text.js` gained steps (`{ steps }`), tips (`{ note }`, class `prose-tip`, not the legal "To be confirmed" notice) and subheadings (`{ heading, id }`).
- `data/guide-index.js` (generated) and `js/guide-search.js`: one search on `/guide` and `/help`, hidden without JavaScript.
- Links: footer, `/help`, `/contact`, the Studio's intro. Reserved creator names: `guide`, `guides`, `community`, `communities`, `forum`, `forums`.
- Articles: buying, Your Stacc, collections and tags, following, refunds; becoming a creator, building your site, selling, the Pac Builder, getting paid, teams, storage and limits.
- Not yet: a "?" link from each Studio panel to its manual article.

## Rules for the content

- Describe only what the site really does ([production](production.md)). Planned features are not documented until built; a section that would cover one is left out, not written as if it exists.
- Each article has an owner-visible `updated` date and is checked when the code it describes changes (the [docs](index.md) rule applied to user docs).
- Copy follows [autostacc](autostacc.md); creator articles never use the Glitches & Stitches voice.
