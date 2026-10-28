---
title: Search and tags
summary: The site-wide search bar in the header, the /search results page, hashtags on anything (one tag rule, typo-tolerant suggestions, team and admin rules) and AutoStacc's word levels for names, tags and posts.
covers: [js/site-search.js, js/search-sources.js, js/search-page.js, css/search.css, scripts/lib/search-page.js, search.html, server/tags/, server/lib/tags.js, server/lib/words.js, server/lib/word-lists.js, js/tag-input.js, css/tag-input.css, js/admin-tags.js, js/community-words.js, db/migrations/0072_tags_and_words.sql, test/unit/words-and-tags.test.js]
updated: 2026-10-28
---

# Search and tags

Decided by the owner on 2026-10-27 (#230, [decisions](decisions.md)).

## The search bar

Every AutoStacc page (not a project's own pages, which keep their own frame) has one search bar in the header (`js/site-search.js`), a full-width row on phones.

- **Everywhere else (All):** typing shows a dropdown like a browser's address bar, a few matches per group: Tags, Store, Creators & projects, Community, Help. Enter opens `/search?q=`.
- **On a page with its own search** (the store, Discover, New & upcoming, the community) the bar is scoped: the page's own search box moves into the bar (tied to its form by the `form` attribute, so the page's suggestions, Enter and address keep working; the rest of the page's form hides), a chip switches the bar to All, and **Filters** (phones and tablets; on a computer the filters sit beside the results) opens that page's filters. Only one search bar is ever on screen.
- The community's Notifications and Saved panels sit in the header beside the account menu.

`js/search-sources.js` asks each area through its own public API at once (`/api/tags/suggest`, `/api/store/search`, `/api/projects/browse`, `/api/creators`, `/api/community/search` or `/tagged`) and searches the help and guides in the browser from `data/guide-index.js`; one area being down never empties the rest. A query starting with `#` is a tag: creators and projects match their tags, the community lists the takes tagged with it.

`/search` (`scripts/lib/search-page.js`, `js/search-page.js`) shows tags first, then tabs (All and each group) with a "See all and filter" link into each area's own search. It changes with every query, so it is noindex and blocked in `robots.txt`. Nothing typed is stored.

## Tags

One rule for everything (`server/lib/tags.js`): products, releases, events, creators, projects, community spaces and takes each carry up to 8 tags of at most 24 characters. Anyone who may edit the thing types its tags in the tag box (`js/tag-input.js`, any `<input data-tag-input>`): chips, suggestions from all of AutoStacc as you type, Enter or comma to add. A typed tag is **folded, never refused** for its shape: case and accents go, separators become hyphens, a leading `#` is dropped (`#Lo Fi` is `lo-fi`). A tag with a strong word or a slur is refused.

- **Suggestions** (`server/tags/tags.js`, `GET /api/tags/suggest`): every module exports its tag counts for what people can see; matches start-with first, then contains, then close spellings (one typo from 4 letters, two from 7; a swap of neighbouring letters is one). A tag is saved as typed and never merged into a near one.
- **#tags in posts** become links to `/search?q=%23tag`.
- **A space's team** keeps a few suggested tags and can **hide** a tag in its space (it stays on its takes but isn't shown or listed there).
- **AutoStacc's admins** (Control Center › Community › Tags, `js/admin-tags.js`, `GET`/`PUT`/`DELETE /api/admin/tags`, audited) hide a tag everywhere or rename it (everything tagged with it shows and is found under the new name). Nothing tagged is rewritten (`tag_rules`, `server/tags/rules.js`).

## Word levels

`server/lib/words.js` with the lists in `server/lib/word-lists.js`. Whole words only (so "class", "assassin" and "Scunthorpe" never match), case and accents folded, digits and symbols read as the letters they stand for.

| Level | Examples | Titles, names, tags | Posts |
|---|---|---|---|
| Mild | damn, hell, crap, shit, piss, sick, sucks, bloody, ass | allowed | allowed |
| Strong | fuck and its forms, cunt, motherfucker, bitch, whore, slut, asshole, dickhead | refused | allowed, shown by the reader's setting |
| Slurs and the ban list | racial, ethnic, religious, homophobic, transphobic and ableist slurs | refused | refused |

**How a word is graded:** by how commonly and how harshly it is used to insult or demean someone, not by how rude it sounds. Reclaimed words used within their own communities ("queer") are on no list. Anyone editing the lists grades new words the same way.

**Titles** are take titles, usernames, community and channel names, and creator, project, product, release and event names.

**The reader's setting** (Settings › Profile, `PUT /api/community/me/words`): **Restricted** (the default, and everyone signed out) shows strong words softened, f***; **None** shows them as written; **Off** folds posts that have them behind "Show post". The server draws the softened word with the word kept in `data-w` (pages are cached and shared), and `js/community-words.js` applies the setting in the browser.

**Spaces may only be stricter:** a team can keep its space clean (strong words refused in posts there too) and add its own filtered words; it can never allow a slur or a strong word in a tag or title.
