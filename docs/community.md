---
title: Community
summary: PLANNED, foundations built (#135: switch off, tables, formatter, rules pages) (owner, 2026-10-16): spaces for AutoStacc, each project and user-made communities, with channels; discussions, questions and answers, updates, polls and challenges; upvotes; AutoStacc base rules everywhere plus stricter local rules; moderation, age, notifications, build order.
covers: [server/community/, functions/community.js, functions/community/, scripts/lib/community-page.js, css/community*.css, js/community*.js, db/migrations/0031_community.sql, db/migrations/0032_community_platform_space.sql, db/migrations/0033_community_nested_replies.sql, db/migrations/0034_community_pace.sql, db/migrations/0035_community_moderation.sql, db/migrations/0036_community_upkeep.sql, test/unit/community-format.test.js, test/unit/community-names.test.js, test/unit/community-hooks.test.js, test/unit/community-moderation.test.js, test/api/community.suite.js, test/api/community-posting.suite.js, test/api/community-moderation.suite.js, test/api/community-upkeep.suite.js, test/api/community-legal.suite.js, test/api/community.test.js]
updated: 2026-10-20
---

# Community

> **PARTLY BUILT, NOT LIVE.** The read side, posting and moderation are built (#135, #136, #137) but behind the `community.forum` switch, which stays off until the launch gates in [community safety](community-safety.md) are done; `/community` says "opening soon". Later steps (below) are planned only. This turns the open question "community features" in [vision](vision.md) §8 into what the owner chose on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). Profiles, points, friends and collab requests are in [profiles](profiles.md). Support articles are in [guides](guides.md). Legal and security requirements (launch gates, copyright strikes, urgent reports, contest rules) are in [community safety](community-safety.md).

"Like Reddit, but less of a do-what-you-want" (owner): a place to ask questions and get answers, share and have fun, and grow communities without needing a creator, inside rules AutoStacc sets.

**Scope (owner):** music and sound (making, sharing and talking about it, sound design, gear and software, the creators and projects on AutoStacc, challenges) and ideas and thoughts about products and AutoStacc. It isn't a general social site: spaces and threads outside that are off-topic and can be removed, and chat goes in a space's own off-topic channel. The aim is a space that stays welcoming to people coming in, not hostile to them.

**Who is accountable (owner):** each space's owner and team moderate it. AutoStacc does only what the law requires of the site and what can be done automatically or simply, which also keeps the legal duties as few as possible ([community safety](community-safety.md)).

## What the owner chose

| Question | Choice |
|---|---|
| Spaces | AutoStacc's own, an Official space each project can turn on, and **communities any verified account can start** |
| Structure | Each space has **channels** its owners set up |
| Post types | Discussion, **Question**, **Update**, **Poll**, **Challenge** |
| Q&A | A Question post type in spaces **and** a central Q&A page gathering questions from every space by tag |
| Answers | The asker (or a moderator) accepts one; others get **Helpful** votes (up only) |
| Threads | **Upvotes** (no downvotes) drive Hot and Top sorting |
| Fun | Challenges, Show your Stacc, games and events, badges and streaks |
| Polls and challenges | Hosted by creators (in their project space) and moderators (in a community) |
| Communities about a creator | Allowed, labelled **Unofficial**; only the creator's own space is **Official** |
| Rules | AutoStacc **base rules** everywhere, never loosened; each space may add **stricter** rules |
| Posts | Text with simple formatting and links. Challenge entries may also be audio (below) |
| Visibility | Public and indexed. People appear by display name only |
| Age | **16+** to post or connect, self-declared, no verification system |
| News | First-party news moves from `data/news.js` to Updates once Updates exist |
| Outside communities | None; everything is on autostacc.com |

## Look and words (owner, 2026-10-20)

Clean but charming, in the app's own theme (a friendlier DAW: [autostacc](autostacc.md#visual-identity-placeholder-logo)):
- **Words:** a thread is a **take** ("New take"); upvote is **Boost**; sorting is **Hot / Fresh / Top**; an accepted answer is the **Best answer**. Reply and Helpful stay plain. Plain words stay in tooltips and screen-reader labels. This is the community's own vocabulary (owner); the rest of the platform keeps its plain voice. Code and addresses keep "thread".
- **Lists** of takes are **channel strips**: slim cards with a coloured edge in their channel's track colour, the title, and small meters for boosts and replies; they lift a little on hover like the store's cards.
- **Boost** is a small **level meter**: pressing it makes the meter jump with a quick bounce and settle, the count beside it.
- **Beside a name**, until profile pictures exist: a **tiny waveform** drawn from the name (the same every time for a name), so people are easy to tell apart.
- **Writing** opens **inline** (a New take button on spaces and channels, the reply box under a take) with **Write / Preview** tabs (the preview is the server's own formatting), a few formatting buttons (bold, italic, link, list, quote) and drafts kept in the browser.
- **Front page** (`/community`): a row of **spaces shown as mixer channels** (name, Official / Unofficial, a small activity meter), then **Hot takes** from everywhere, and a box of **unanswered questions** for newcomers.
- **Charm**, all short and off for reduced motion: the boost bounce, new posts **stacking in**, friendly **empty-state** lines with a tiny illustration, and a soft **glow** when a best answer is picked.
- **Replies are fully nested** (any depth). On phones the indent stops growing after a few levels and deeper replies fold behind "more replies".

## Features (owner, 2026-10-20)

Each is its own feature with its own switch (see "Built as independent features" below):
- **In posts:** music embeds (SoundCloud, YouTube, Spotify, Apple Music links become players, rebuilt from the link like creator pages, never pasted code), **store item cards** (a link to an AutoStacc product, Pac or project shows as a card with picture and price from the store), and **code / settings blocks** kept exactly as typed.
- **Keeping up:** follow a take (your own and ones you reply to automatically), join a space (its takes come first on your front page), save for later (a private Saved list). No unread markers.
- **Notifications:** **@mentions** (blocked people can't mention you; mention alerts can be switched off) and an **on-site inbox** (a bell in the top bar: replies, mentions, best-answer picks), beside the configurable emails.
- **Finding:** community **search** (by words, filtered by space, channel and kind), **tags** (AutoStacc's starter list from the store vocabulary, plus a few each space's team adds; people pick from those), and **similar takes** shown while typing a new question's title.
- **Names:** a **mini profile card** on hover or tap (name, waveform, member since, Best answers, team roles), with **Block** and **Report**.
- **Team tools:** channels and rules, **pinned and featured** takes, a **welcome message** on a first visit or post, and the space's **look** (accent colour, banner from presets).
- **Store links:** **product takes** (a take per product, linked from its page), an opt-in **buyer badge** ("Owns this", since it reveals a purchase), and **release takes** opened automatically with an Update or release.
- **Self-promotion:** linking your own products, Pacs or projects is allowed in ordinary takes, **never in answers to questions or in question channels** (the post is refused and says why). A space's team can switch self-promotion off **for one channel or the whole space**; then those links can't be added there at all. The base rules say so.
- **Links (owner):** a link to **any AutoStacc page** (a take, a guide, a project, a creator, someone's profile) is welcome anywhere and shows as a warm **preview card**, not bare link text. **Product pages** are the exception: they count as promotion and follow the self-promotion rule. **Links to other sites** pass at once when the site is on **AutoStacc's safe list** (well-known music and creative sites) or the **space's own allowed list**; a site on the **site-wide ban list** (adult sites, sites that download automatically, malware and the like) is always refused, and no space can allow it; any other site **waits for the space's moderators**.
- **Automatic moderation (owner):** every space's team gets switchable, tunable rules: **word and phrase filters** (AutoStacc's own slur list is always on), **new-account rules** (first posts held, or no links, for accounts younger than a set age or new to the space), the **link rules** above, and **pattern rules** set up from a form (if a post matches, hold it, refuse it, tag it or reply with a message), like Reddit's AutoModerator.
- **Posting pace (owner):** each space's team sets its own **slow mode** (off, 30 s, 2 min, 10 min), counted per space; site-wide, about **3 new posts a minute** per person (like Reddit's rate limit), the same text twice in a row is refused, and daily caps are only a high safety net. Display names are chosen once (AutoStacc can rename on request); posts can be edited for 24 hours with history; posts up to 10,000 characters.

## Built as independent features (owner, 2026-10-20)

"No system is reliant on another, so a major change needs no big rewrite" (owner). So:
- **A small core** (`server/community/core/`) owns spaces, channels, takes, posts, members, access checks, the formatter and the page frame, and knows nothing about any feature.
- **Each feature is a folder** (`server/community/features/<name>/`) with a manifest: its own switch (`community.<name>`), routes, tables (its own migration; it never alters core tables except through a column it owns, added in its own migration), browser script and styles (`js/community-<name>.js`, `css/community-<name>.css`) and tests (`test/api/community-<name>.suite.js`).
- **Features plug into the core only through named hooks**: events the core emits after it changes something (a take started, a reply posted, a post edited or removed, an answer picked), **slots** on the rendered pages (a post's footer, a take's tools, a space's header, a list row's badges, the front page's boxes), **formatter extensions** (embeds, store cards, code blocks, mentions add inline or block rules), and **checks** the core asks before a write (self-promotion, slow mode, blocks).
- **Features never import each other.** If two need the same thing, it moves into the core as a hook, or into a shared helper with no feature logic.
- **Switching a feature off** removes its routes (404), its slots render nothing, its formatter rules stop (links stay plain links), its checks stop, and its data stays untouched for when it's switched back on.

## Spaces and channels

- **AutoStacc**: the platform's space. Channels at launch: *Announcements* (team only), *Help & questions*, *Feedback & ideas*, *Show your Stacc*, *Challenges*.
- **Project spaces**: the Official space of a project with the `"community"` feature (`data/projects.js` for first-party projects; a switch in the Studio for creators). Run by the creator team with their team roles ([builder](builder.md) teams).
- **Communities**: started by any verified account about a topic, or a creator (then Unofficial). Run by the founder and the moderators they appoint.

Owners create, rename, order and archive channels. Each channel sets who may start threads and which post types it allows.

**Addresses.** `/community` (spaces, Hot threads, filters), `/community/questions` (central Q&A: unanswered, answered, by tag), `/community/challenges` (open and past challenges everywhere), `/community/<space>`, `/community/<space>/<channel>`, `/community/t/<id>-<slug>`, `/community/rules`. A project space also appears at `/<creator>/<project>/community`, its canonical address. Space names are unique and permanent.

## Post types

- **Discussion**: anyone allowed in the channel.
- **Question**: tagged, listed in the space and on `/community/questions`. The asker or a moderator accepts an answer, which is pinned on top. Other answers sort by Helpful votes (up only, one per verified account). Answered questions are indexed so people find them from search. A question in AutoStacc's Help channel can link to a [guide](guides.md) article.
- **Update**: an official announcement by the space's team, and in a project space by those with the publishing capability. It appears on the project's news page and followers' dashboards. **All news moves here**, first-party included (owner). The news addresses (`/<creator>/<project>/news/<slug>`) and their SEO must survive the move: the pages are rendered on the server from Updates, old addresses keep working, and `data/news.js` is retired only once that's in place.
- **Poll**: by creators and moderators. It reuses `server/polls/` (one vote per verified account, changeable while open), extended so polls can be made from the Studio and the community, not only `data/polls.js`.
- **Challenge**: by creators and moderators, with a brief, dates, optional free pack, and how it's judged (community vote, host's pick, or both; host chooses). Entries are replies. The **host decides** whether entries are **audio uploads, links, or both**:
  - Uploads: audio only, with size and length limits, stored privately in R2, streamed and never downloadable, checked by the [engine](engine.md), removed if reported. They count toward the host's storage cap if hosted by a creator ([creators](creators.md)).
  - Prizes: **store items only** (free access to the host's own products in Your Stacc), badges, points ([profiles](profiles.md)) and a feature on the host's page. No cash.
  - Using sounds from a challenge pack follows that pack's licence; a challenge licence is part of the open Community License question in [vision](vision.md) §6.

**Games and events** are threads with a schedule: weekly prompts, guess-the-sample, AMAs with creators, listening parties. They use the same post types plus a start time and a "going" list.

**Ranking.** Upvotes (one per verified account, no downvotes) give Hot (votes weighed by age), Top (week, month, all time) and New. Bad posts are handled by reports, not downvotes.

## Rules

**Base rules (AutoStacc, everywhere, not negotiable).** Nothing illegal. No threats, harassment, hate, doxxing or sharing private information, sexual content involving minors, spam or scams, piracy (sharing paid packs or anyone's files without rights), or impersonation. Published at `/community/rules` and linked from the terms. The wording is drafted, then approved by the owner.

**Welcoming (guideline, owner).** The rules recommend welcoming beginners and not mocking basic questions. It's a guideline, not a base rule: each space decides how to enforce it.

**Space rules (stricter only).** Each space may add topic, tone, self-promotion or spoiler rules, shown beside its threads. They can only add limits, never allow what the base rules forbid.

**Who enforces what.**
- Space team (founder or creator team, and moderators): responsible for their space. Pin, lock, hide and restore, move between channels, remove from their space, ban someone from their space, for either set of rules; handle danger reports first (top of their queue); handle appeals of their own decisions. Logged.
- AutoStacc (Control Center, [admin](admin.md)) handles **only the legal minimum**: illegal-content notices (the EU notice form), copyright notices and strikes, CSAM, impersonation of creators, and account-wide suspensions that follow from those. It removes a space, or a team member, only when they leave illegal content up after notice.
- **Automatic for every space**: spam filters, rate limits, Turnstile, a post with several reports from different accounts is hidden until the space team decides, and crisis resources shown on self-harm wording.
- Everyone: report a post (rule-breaking, harassment and danger go to the space team; illegal content, copyright and impersonation to AutoStacc), block a person. Appeals of a space's decisions go to that space's team.
- The author is always told when their post is hidden or removed, and why.

**Unofficial communities about a creator** can't use the creator's name alone or their logo and artwork. Their header says Unofficial and links to the official space.

## Starting communities

- Any verified account, 16+, straight away.
- **A cap of 3 communities per account**, adjustable by AutoStacc (a setting, with per-account exceptions). Creator and project spaces don't count toward it.
- **Name checks**: reserved words (AutoStacc, admin, official), creators' and projects' names unless they're yours, and slurs.
- **Inactive teams (automatic)**: when no team member has acted for **40 days**, or reports have waited unhandled for 40 days, the space turns read-only by itself and the founder is emailed. A team member reopens it by handling the queue. A long-read-only space can be taken over by a willing member (a request the system checks; no AutoStacc review).
- If a founder deletes their account, the longest-serving moderator becomes founder. With no moderators, it's archived and can be handed over.
- Owner, for later: a system that makes starting a *project* "a little less willy-nilly" (not designed yet).

## Age, accounts and notifications

- **16+** to post, vote, start communities, add friends or enter challenges. Self-declared once (a confirmation in Settings and at first post). **No age-verification system** (owner). The terms say the person is responsible for what they declare. Reading stays open to all. An "underage account" report reason exists, because once AutoStacc knows someone is under 16 it must remove the account's community data; terms alone can't waive that. The terms wording needs the owner's (ideally a lawyer's) review.
- **Deleted accounts**: posts and answers stay, shown as "deleted user", so threads still make sense. Name, profile, points, friends and items are erased ([profiles](profiles.md)). The person can tick "delete my posts too".
- **Email notifications**, each switchable in Settings: answers to your questions, replies to you (grouped, at most every few hours), updates from projects you follow, friend and collab requests, challenge results. All of them configurable (owner).

## Design (architect review 2026-10-16)

**AutoStacc's queue (#137 part 3, built, switch off):** the **legal** feature (`community.legal`) gives the Control Center the reports routed to AutoStacc ([admin](admin.md#community-reports)): a legal removal goes through the core's `legalRemove` (any state but an earlier legal removal, so even what its author deleted is kept; logged in the space's log as `legal_remove`, so the team and the author see "Removed by AutoStacc: …"), may suspend the author from the whole community, and can't be appealed to the space (the author's notice points to the copyright counter-notice or support); under 16 removes and empties the account's posts and takes, erases its community data and suspends it for good. Tests: `test/api/community-legal.suite.js`. Security review (2026-10-20), fixed: under 16 never touches what was removed for a legal reason (nor does account deletion's erase of edit history); both report queues pick their items in SQL and load them in a few queries (`loadTargets` in the core), danger first in the team's; the Control Center's prompt warns that the space's team sees the removal reason; suspension days must be a whole number. Still to build for #137: formal copyright notices, counter-notices and tiered strikes ([community safety](community-safety.md#copyright-tiered-strikes)).

**Blocks, help lines, inactive spaces and retention (#137 part 2, built, switch off):** three more features and the core's cleanup. **blocks** (`community.blocks`): block by community name (never yourself, up to 1,000); the blocked person can't reply under your takes or anywhere below your posts (a post check up the whole branch; a space's team is never stopped in its own space), and their posts fold away for you on every page (`js/community-blocks.js`; pages are shared and cached, so it happens in the browser); they aren't notified, though a refused reply shows them; Boost and Helpful aren't affected. Security review (2026-10-20), fixed: retention never clears a post removed for a legal reason (even inside a take removed otherwise) and keeps AutoStacc-routed reports; its two steps pick the same posts; a restore can't race the cleanup; a failed email never stops the others and dedupe keys use account ids. **crisis** (`community.crisis`): under a post whose words suggest self-harm (`core/wording.js`, shared with the report triage), a quiet note with 988 in the US and findahelpline.com elsewhere; it never hides or flags the post. **upkeep** (`community.upkeep`): in the daily sweep (`server/maintenance/sweep.js` → `communitySweep` in `server/community/index.js` → each feature's `sweep` hook), a space other than AutoStacc's own with no team activity for 40 days, or a report waiting 40 days, turns read-only (`state_reason` `inactive_team`, logged as automatic) and its founder, or a project's owners, get one email (`community-read-only`); a team member reopens it from the Team desk (`js/community-upkeep.js`) once no report has waited 40 days. **Retention** (`core/retention.js`, always, whatever the switches): 12 months after a take or post was removed by its author or under a space's rules (`removed_at`, migration 0036), its text, edit history and the take's title are deleted (the placeholder stays) and it can no longer be restored; handled reports and decided appeals are deleted 12 months after handling; legal removals are left for AutoStacc; the team logs stay. Styles: `css/community-safety.css`. Tests: `test/api/community-upkeep.suite.js`.

**Moderation and reports (#137 part 1, built, switch off):** the core's `moderate.js` is the one place a take or post changes state for moderation (hidden, removed under a space's rules, visible again), compare-and-set in one guarded batch with its entry in `community_mod_log`; removals by the author or for a legal reason are never undone there. Two features use it and never each other. **moderation** (`community.moderation`): the space's team pins, locks, moves (within the space, to a channel that takes the post's type), hides, removes and restores takes and posts, each with a reason (required to hide or remove: the author is told) and limited to 60 actions in 10 minutes per moderator; bans by community name (days or until lifted, never yourself or the team, 20 an hour); the author sees their own taken-down posts of the last 12 months with the reason (`GET /api/community/moderated`, shown on the community's pages) and may appeal each once (`community_appeals`, migration 0035), granted or refused with a reason by the team; the team's log names people, never account ids. **reports** (`community.reports`): a member reports a take or post (never their own; reporting an opening post reports the take) with a reason and a note of at least 10 characters, one open report per person and item, 20 an hour; rules, harassment, danger and spam go to the space's team, illegal content, copyright, impersonation and underage to AutoStacc (their Control Center queue is the next step). When 3 different trusted reporters (7+ days old, fewer than 3 dismissed reports in 90 days) have open reports made since the item was last brought back, it's hidden automatically until the team decides, except a team member's own post. The team's queue (on the space's page, the "Team desk") ranks danger first, then hurt or threat wording matched on our server (`triage.js`), then harassment, then how many reported; reporters stay anonymous to the team. Upholding removes it with a reason; dismissing keeps it, brings it back if the automatic rule hid it, and lowers the reporters' standing; 2 dismissed danger reports in 90 days take the danger reason away from that reporter. Browser: `js/community-moderation.js`, `js/community-reports.js`, `css/community-moderation.css`; the kit gained the team desk (`data-cm-space`, `GET /api/community/spaces/:id/mine`) and the notices box (`data-cm-notices`). Tests: `test/api/community-moderation.suite.js`, `test/unit/community-moderation.test.js`. Security review (2026-10-20), fixed: only reports the space's team decides count toward hiding (AutoStacc-routed ones wait for AutoStacc), people banned from a space can't report in it and banned or suspended reporters stop counting, one open report per person and item is a unique index, two moderators deciding the same reports or appeal at once can't both win, the team's reads (queue, appeals, bans, log) are audited during a support impersonation, and account deletion also forgets who decided reports and appeals and drops bans of the person; the team logs stay as an append-only record. AutoStacc's queue followed in part 3.

**Posting and the first features (#136 part 2, built, switch off):** the core moved to `server/community/core/` (members and names, access, posting with nested replies, edits, the hooks in `hooks.js`, `mine.js`, `votes-store.js`, renderers split into `render.js`, `render-thread.js` and `render-parts.js`); features in `server/community/features/` registered by `features/index.js` and composed in `server/community/index.js`: **boost** (`community.boost`), **qa** (`community.qa`: Helpful, Best answer), **waves** (`community.waves`), **preview** (`community.preview`) and **pace** (`community.pace`: slow mode per space via migration 0034, 3 posts a minute, no duplicates, a high daily cap). Browser: `js/community-kit.js` (shared helpers), `js/community.js` (core: join, composer with Write / Preview, toolbar and drafts, new take, nested replies, edit, delete), `js/community-boost.js`, `js/community-qa.js`; styles `css/community.css`, `css/community-boost.css`, `css/community-qa.css`, `css/community-waves.css`. Account deletion and the data download include the community and every feature's own data. Tests: `test/unit/community-names.test.js`, `test/unit/community-hooks.test.js` (a feature switched off contributes nothing and leaves the others working), `test/api/community-posting.suite.js`. `/privacy` describes the community's data. Security review (2026-10-20), fixed: display names must be plain a-z once accents are off (no dotless ı, small capitals or Latin alpha), digits are read as letters and a name containing a creator's or project's is refused; the per-minute and slow-mode limits are atomic counters, so parallel posts can't race past them; editing needs the same standing as posting (not banned or suspended, take visible and not locked); a banned asker can't pick a best answer; archived channels take no replies; reply counts are counted without recursion.

**Read side (#136, built, switch off):** `/community` is a generated page (`scripts/lib/community-page.js`) that says "opening soon" while the switch is off. With it on, `functions/community.js` and `functions/community/[[path]].js` (→ `server/community/core/entry.js`) fetch that page from the static site as a template and `server/community/core/page.js` fills its head, heading and main areas with what `public.js` builds from the database: `/community` (spaces and the hottest threads), `/community/<space>`, `/community/<space>/<channel>` (sorted hot, new or top, 25 a page; only the default view is indexed), `/community/t/<id>-<slug>` (a missing or old slug redirects; a question shows its accepted answer first, then answers by Helpful votes; hidden and removed posts are placeholders; `QAPage` or `DiscussionForumPosting` JSON-LD) and `/community/sitemap.xml`. Hidden, removed and unknown threads are the site's 404. Pages carry the store's strict policy (this site's scripts only, no framing) and are cached a minute at the edge in production. AutoStacc's own space and its five channels are created by migration `0032_community_platform_space.sql`. Tests: `test/api/community.suite.js` (switched on, its own store; switched off in the accounts group). The edge cache is keyed by path plus the normalised sort and page only, so junk parameters can't reach the database; HEAD answers from it too. Not yet: `robots.txt`'s second `Sitemap:` line (at launch), first-party project spaces (`dist.js`). **For the write side** (security review, 2026-10-16): a moderation action must purge the thread's, its space's and channel's, the home page's and the sitemap's cache keys (until then a hidden thread can stay cached up to a minute, the sitemap ten); and thread slugs are made on write from the title as lowercase letters, digits and hyphens only, since the address accepts nothing else.

**Built so far (#135):** the `community.forum` switch (off), migration `0031_community.sql` (tables below), the formatter `server/community/core/format.js` with `test/unit/community-format.test.js`, the reserved page address `community` in project sites (`server/sites/document.js`), and the rules and copyright pages ([community safety](community-safety.md)). The tables stay empty while the switch is off.

**Modules.** One area, `server/community/`, split by job: `spaces.js`, `access.js` (one check, scoped to a single space), `threads.js`, `posts.js`, `votes.js`, `format.js`, `render.js` and `public.js` (server-rendered pages), `sitemap.js`, `reports.js`, `moderation.js`, `erase.js` (account deletion and export), `routes.js`. It reuses `server/creators/roles.js` for project spaces (new capabilities such as `community.moderate`, `community.update`), `server/lib/ratelimit.js`, `server/email/`, `server/polls/`, and the impersonation policy (community writes never opt in, so support views stay read-only). It never imports `server/sites/` rendering, and orders, payments and entitlements never read community data. Wording: `server/library/` is the builder's "community library" of site pieces; the community is a different thing and keeps distinct names.

**Rendering.** Threads are user content, so they're rendered on the server by their own Pages Function for `/community` (planned, a thin entry calling the community area's public renderer), not the creators' catch-all, with the edge-cache pattern of `server/sites/public.js` (production, about a minute). The HTML is the same for everyone; votes and controls load from `/api/community/*`. Removing illegal content purges the cached page (one data centre per purge, so the cache stays short). Head: canonical, Open Graph, `DiscussionForumPosting` or `QAPage` JSON-LD. Thread URLs are listed in `/community/sitemap.xml` (a second `Sitemap:` line in `robots.txt`); hidden and removed threads are `noindex` and left out. User links carry `rel="ugc nofollow noopener"` and show their domain.

**Addresses.** A thread is `/community/t/<id>-<slug>`; the id is what counts, so an edited title redirects (301) to the new slug. Project spaces: in Studio projects, `community` can't be a page's address (refused since #135) and `server/sites/public.js` will hand that path to the community renderer. First-party projects' folders are excluded from Functions as a whole today (`scripts/dist.js`), so their `/community` needs per-project excludes there first (also needed when news moves to Updates).

**Project spaces.** A project uses the community through its `"community"` feature; for first-party projects in `data/projects.js`, for creators a Studio switch that creates the space row. The team is the creator's team, read through the project, never copied.

**Formatting.** `server/community/core/format.js`: paragraphs, line breaks, **bold**, *italic*, `code`, lists, quotes, and http(s) links (bare or `[label](url)`), each link followed by its domain. Everything else is escaped; other link schemes, credentials in links and broken addresses stay plain text. Direction-control characters are dropped and labels sit in `<bdi>`, so a label can't reverse the shown domain (security review, 2026-10-16). For the read side: style `.link-host` so the domain is clearly separate and never cut off, and escape `plain()` wherever it goes into HTML (it returns raw text by design).

**Data (`0031_community.sql`).** `community_members` (display name, folded `name_key`, 16+ confirmation), `community_spaces` (kind platform / project / community, `project_id` for project spaces, state open / read_only / archived, last team activity), `community_space_roles` (founder, moderator), `community_channels` (allowed post types, who may start), `community_threads` and `community_posts` (state visible / hidden / removed and why, stored score and Helpful counters), `community_post_edits`, `community_votes`, `community_reports` (reason and route to the space or AutoStacc), `community_blocks`, `community_space_bans`, `community_suspensions`, and `community_mod_log` (append-only: what space teams did, so founders can see and undo it; AutoStacc's legal actions go to `admin_audit`). Authors become NULL ("deleted user") when an account is deleted, in code, since D1 doesn't enforce ON DELETE. Later migrations: tags, challenges, notification choices, strikes, profiles, points.

**Display names** live in `community_members`, not the account name. The impersonation check will extend `server/creators/holds.js` to every creator, project, held name and reserved word, and fold look-alike characters first (today's `nameKey` drops non-Latin letters, so a Cyrillic "А" could slip past).

**Polls** from the community need a `source` column so the catalog sync (which owns `data/polls.js` polls) leaves them alone, and an owner that can be a space (`polls.project_id` is required today).

**Posting limits.** A confirmed email and the 16+ confirmation are required. New accounts get few threads, replies, votes and links per day (`server/lib/ratelimit.js`), and the limits loosen with age and a clean record. Authors can edit for a short window (with history) and delete their own posts.

**Privacy and legal.** Published now (owner, 2026-10-16): [/community-rules](../data/legal.js) (marked "opening soon"), [/copyright](../data/legal.js) (it already applies to creators' uploads), the terms' pointer to both, and the privacy policy's legal requests. `/privacy`'s list of community data (display name, posts, votes, reports, blocks, roles, age confirmation) is added in the change that first collects it. Account export and deletion get hooks in `server/account/export.js` and `delete.js`.

## Open questions

- The tags for the central Q&A (fixed list, or each space adds its own?).
- The system that makes starting a project less "willy-nilly" (owner, later).
- Mature (18+) communities: not chosen; none in v1.
- A Community License for challenge packs ([vision](vision.md) §6).

## Build order

1. ~~Architect review, rules and legal pages, migration, formatter~~ (done, #135).
2. ~~Read side: the community Function, spaces, channels, threads rendered on the server, `/community/sitemap.xml`~~ (done, #136; first-party project spaces and the `robots.txt` line still to do).
3. ~~Posting: display names, age declaration, the formatter, Discussion and Question, accepted answers, Helpful votes, upvotes and sorting, limits, edit and delete~~ (done, #136; switch off).
4. Moderation (built, switch off, #137, except formal copyright notices, counter-notices and tiered strikes): routed reports, urgent reports with false-report filtering, blocks, space bans, copyright notices and strikes, Control Center queue, suspensions, audit. **The whole feature stays behind a switch (`community.forum`, off) until this step and the launch gates in [community safety](community-safety.md) are done.**
5. Project spaces and Updates (Official marks, team roles, news pages and dashboards from Updates; then move `data/news.js` with addresses kept).
6. Polls from the Studio and communities; the central Q&A page.
7. Communities anyone can start: cap setting, name checks, founders and moderators, Unofficial marks, hand-over and archive.
8. Challenges (uploads or links per host, judging, item prizes), games and events.
9. Email notifications and their settings.
10. [Profiles](profiles.md): badges, points, showcase, friends, feed, collab requests, point items.

Each step runs `store-check` and the security, backend and SEO reviewers.
