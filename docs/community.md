---
title: Community
summary: PLANNED, foundations built (#135: switch off, tables, formatter, rules pages) (owner, 2026-10-16): spaces for AutoStacc, each project and user-made communities, with channels; discussions, questions and answers, updates, polls and challenges; upvotes; AutoStacc base rules everywhere plus stricter local rules; moderation, age, notifications, build order.
covers: [server/community/, db/migrations/0031_community.sql, test/unit/community-format.test.js]
updated: 2026-10-16
---

# Community

> **PLANNED / NOT IMPLEMENTED.** Nothing here exists yet. This turns the open question "community features" in [vision](vision.md) §8 into what the owner chose on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). Profiles, points, friends and collab requests are in [profiles](profiles.md). Support articles are in [guides](guides.md). Legal and security requirements (launch gates, copyright strikes, urgent reports, contest rules) are in [community safety](community-safety.md).

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

**Built so far (#135):** the `community.forum` switch (off), migration `0031_community.sql` (tables below), the formatter `server/community/format.js` with `test/unit/community-format.test.js`, the reserved page address `community` in project sites (`server/sites/document.js`), and the rules and copyright pages ([community safety](community-safety.md)). Nothing else exists yet; the tables stay empty while the switch is off.

**Modules.** One area, `server/community/`, split by job: `spaces.js`, `access.js` (one check, scoped to a single space), `threads.js`, `posts.js`, `votes.js`, `format.js`, `render.js` and `public.js` (server-rendered pages), `sitemap.js`, `reports.js`, `moderation.js`, `erase.js` (account deletion and export), `routes.js`. It reuses `server/creators/roles.js` for project spaces (new capabilities such as `community.moderate`, `community.update`), `server/lib/ratelimit.js`, `server/email/`, `server/polls/`, and the impersonation policy (community writes never opt in, so support views stay read-only). It never imports `server/sites/` rendering, and orders, payments and entitlements never read community data. Wording: `server/library/` is the builder's "community library" of site pieces; the community is a different thing and keeps distinct names.

**Rendering.** Threads are user content, so they're rendered on the server by their own Pages Function for `/community` (planned, a thin entry calling the community area's public renderer), not the creators' catch-all, with the edge-cache pattern of `server/sites/public.js` (production, about a minute). The HTML is the same for everyone; votes and controls load from `/api/community/*`. Removing illegal content purges the cached page (one data centre per purge, so the cache stays short). Head: canonical, Open Graph, `DiscussionForumPosting` or `QAPage` JSON-LD. Thread URLs are listed in `/community/sitemap.xml` (a second `Sitemap:` line in `robots.txt`); hidden and removed threads are `noindex` and left out. User links carry `rel="ugc nofollow noopener"` and show their domain.

**Addresses.** A thread is `/community/t/<id>-<slug>`; the id is what counts, so an edited title redirects (301) to the new slug. Project spaces: in Studio projects, `community` can't be a page's address (refused since #135) and `server/sites/public.js` will hand that path to the community renderer. First-party projects' folders are excluded from Functions as a whole today (`scripts/dist.js`), so their `/community` needs per-project excludes there first (also needed when news moves to Updates).

**Project spaces.** A project uses the community through its `"community"` feature; for first-party projects in `data/projects.js`, for creators a Studio switch that creates the space row. The team is the creator's team, read through the project, never copied.

**Formatting.** `server/community/format.js`: paragraphs, line breaks, **bold**, *italic*, `code`, lists, quotes, and http(s) links (bare or `[label](url)`), each link followed by its domain. Everything else is escaped; other link schemes, credentials in links and broken addresses stay plain text. Direction-control characters are dropped and labels sit in `<bdi>`, so a label can't reverse the shown domain (security review, 2026-10-16). For the read side: style `.link-host` so the domain is clearly separate and never cut off, and escape `plain()` wherever it goes into HTML (it returns raw text by design).

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
2. Read side: the community Function, spaces, channels, threads rendered on the server, `/community/sitemap.xml`, SEO tests, the `dist.js` change for first-party project spaces.
3. Posting: display names, age declaration, the formatter, Discussion and Question, accepted answers, Helpful votes, upvotes and sorting, limits, edit and delete.
4. Moderation: routed reports, urgent reports with false-report filtering, blocks, space bans, copyright notices and strikes, Control Center queue, suspensions, audit. **The whole feature stays behind a switch (`community.forum`, off) until this step and the launch gates in [community safety](community-safety.md) are done.**
5. Project spaces and Updates (Official marks, team roles, news pages and dashboards from Updates; then move `data/news.js` with addresses kept).
6. Polls from the Studio and communities; the central Q&A page.
7. Communities anyone can start: cap setting, name checks, founders and moderators, Unofficial marks, hand-over and archive.
8. Challenges (uploads or links per host, judging, item prizes), games and events.
9. Email notifications and their settings.
10. [Profiles](profiles.md): badges, points, showcase, friends, feed, collab requests, point items.

Each step runs `store-check` and the security, backend and SEO reviewers.
