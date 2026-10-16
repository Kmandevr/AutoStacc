---
title: Community
summary: PLANNED / NOT IMPLEMENTED (owner, 2026-10-16): spaces for AutoStacc, each project and user-made communities, with channels; discussions, questions and answers, updates, polls and challenges; upvotes; AutoStacc base rules everywhere plus stricter local rules; moderation, age, notifications, build order.
updated: 2026-10-16
---

# Community

> **PLANNED / NOT IMPLEMENTED.** Nothing here exists yet. This turns the open question "community features" in [vision](vision.md) §8 into what the owner chose on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). Profiles, points, friends and collab requests are in [profiles](profiles.md). Support articles are in [guides](guides.md). Legal and security requirements (launch gates, copyright strikes, urgent reports, contest rules) are in [community safety](community-safety.md).

"Like Reddit, but less of a do-what-you-want" (owner): a place to ask questions and get answers, share and have fun, and grow communities without needing a creator, inside rules AutoStacc sets and enforces.

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

**Space rules (stricter only).** Each space may add topic, tone, self-promotion or spoiler rules, shown beside its threads. They can only add limits, never allow what the base rules forbid.

**Who enforces what.**
- Space team (founder or creator team, and moderators): pin, lock, hide and restore, move between channels, remove from their space, ban someone from their space, for either set of rules. Logged and visible to AutoStacc.
- AutoStacc admins (Control Center, [admin](admin.md)): base-rule reports from anywhere, site-wide suspensions, removing moderators who abuse the role, closing communities that break the base rules, appeals.
- Everyone: report a post (the reason routes it to the space team or AutoStacc), block a person.
- The author is always told when their post is hidden or removed, and why.

**Unofficial communities about a creator** can't use the creator's name alone or their logo and artwork. Their header says Unofficial and links to the official space.

## Starting communities

- Any verified account, 16+, straight away.
- **A cap of 3 communities per account**, adjustable by AutoStacc (a setting, with per-account exceptions). Creator and project spaces don't count toward it.
- **Name checks**: reserved words (AutoStacc, admin, official), creators' and projects' names unless they're yours, and slurs.
- **Abandoned communities**: with no active moderator for months, AutoStacc can hand it to a willing member or archive it (read-only).
- If a founder deletes their account, the longest-serving moderator becomes founder. With no moderators, it's archived and can be handed over.
- Owner, for later: a system that makes starting a *project* "a little less willy-nilly" (not designed yet).

## Age, accounts and notifications

- **16+** to post, vote, start communities, add friends or enter challenges. Self-declared once (a confirmation in Settings and at first post). **No age-verification system** (owner). The terms say the person is responsible for what they declare. Reading stays open to all. An "underage account" report reason exists, because once AutoStacc knows someone is under 16 it must remove the account's community data; terms alone can't waive that. The terms wording needs the owner's (ideally a lawyer's) review.
- **Deleted accounts**: posts and answers stay, shown as "deleted user", so threads still make sense. Name, profile, points, friends and items are erased ([profiles](profiles.md)). The person can tick "delete my posts too".
- **Email notifications**, each switchable in Settings: answers to your questions, replies to you (grouped, at most every few hours), updates from projects you follow, friend and collab requests, challenge results. All of them configurable (owner).

## Design (to be reviewed by the `architect` agent before building)

**Rendering.** Threads are user content, so they can't be static pages. Pages Functions render them on the server as escaped HTML with the normal head (canonical, Open Graph, `DiscussionForumPosting` or `QAPage` JSON-LD). The browser script adds posting, voting and moderation controls. Thread URLs go into a sitemap the API generates. Hidden and removed threads are `noindex`, and user links carry `rel="ugc nofollow noopener"`.

**Formatting.** One shared, tested renderer: paragraphs, bold, italic, links, lists, quotes and inline code. Everything else is escaped, so no HTML ever passes through ([creators](creators.md): no user code on autostacc.com).

**Data (D1, new migrations).** Spaces (kind, owner, official/unofficial, rules), channels, space roles, space bans, threads (type, tags, schedule), posts and edit history, votes (upvotes, Helpful), accepted answers, challenge settings and entries (with private R2 audio), reports (routed), blocks, suspensions, age declaration, notification preferences. Moderation goes in the existing audit log. Display names are chosen once and checked for impersonation, never the email.

**Posting limits.** A confirmed email is required. New accounts get few threads, replies, votes and links per day, and the limits loosen with age and a clean record. Authors can edit for a short window (with history) and delete their own posts.

**Privacy and legal (same change).** `/privacy` (`data/legal.js`): display name, posts, votes, reports, blocks, roles, age declaration, challenge audio, notification choices. The terms: base rules, 16+ self-declaration, challenge entries (rights stay with the entrant; AutoStacc may host and stream them). Account export includes all of it.

## Open questions

- The tags for the central Q&A (fixed list, or each space adds its own?).
- The system that makes starting a project less "willy-nilly" (owner, later).
- Mature (18+) communities: not chosen; none in v1.
- A Community License for challenge packs ([vision](vision.md) §6).

## Build order

1. Architect review. Draft base rules, privacy and terms text (16+, challenge entries) for the owner, then migrations.
2. Read side: spaces, channels, threads rendered on the server, sitemap, SEO tests.
3. Posting: display names, age declaration, the formatter, Discussion and Question, accepted answers, Helpful votes, upvotes and sorting, limits, edit and delete.
4. Moderation: routed reports, urgent reports with false-report filtering, blocks, space bans, copyright notices and strikes, Control Center queue, suspensions, audit. **The whole feature stays behind a switch (`community.forum`, off) until this step and the launch gates in [community safety](community-safety.md) are done.**
5. Project spaces and Updates (Official marks, team roles, news pages and dashboards from Updates; then move `data/news.js` with addresses kept).
6. Polls from the Studio and communities; the central Q&A page.
7. Communities anyone can start: cap setting, name checks, founders and moderators, Unofficial marks, hand-over and archive.
8. Challenges (uploads or links per host, judging, item prizes), games and events.
9. Email notifications and their settings.
10. [Profiles](profiles.md): badges, points, showcase, friends, feed, collab requests, point items.

Each step runs `store-check` and the security, backend and SEO reviewers.
