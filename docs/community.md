---
title: Community
summary: PLANNED / NOT IMPLEMENTED (owner, 2026-10-16): spaces for AutoStacc, each project and user-made communities, with channels; discussions, official updates and polls as post types; AutoStacc base rules everywhere plus stricter local rules; who moderates what; design and build order.
updated: 2026-10-16
---

# Community

> **PLANNED / NOT IMPLEMENTED.** Nothing here exists yet. This turns the open question "community features" in [vision](vision.md) §8 into a first version the owner chose on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). The rest of §8 (challenges, showcases, collaboration invitations, ambassador programs) stays open. Support articles are [guides](guides.md).

## What the owner chose

| Question | Choice |
|---|---|
| What it is | On-site discussions, plus creators' **updates** and **polls**, in one place |
| Spaces | AutoStacc's own space, a space each project can turn on, and **communities anyone can start** without being a creator |
| Structure | Each space has **channels** (sections) that its owners set up |
| Starting a community | Any account with a confirmed email, straight away |
| Communities about a creator | Allowed, labelled **Unofficial**; the creator's own space is the only **Official** one |
| Who posts | Accounts with a confirmed email, with limits for new accounts; anyone can read |
| Polls | Creators (in their project space) and moderators (in a community); members can't post polls |
| Rules | AutoStacc's **base rules** apply everywhere and can't be loosened; each space may add **stricter** rules of its own |
| Who moderates | Each space's own team enforces its rules; AutoStacc enforces the base rules everywhere and handles appeals |
| Posts | Text with simple formatting and links; no uploads |
| Visibility | Public and indexed; people appear by a display name only |
| Outside communities | None; everything is on autostacc.com |

"Like Reddit, but less of a do-what-you-want" (owner): communities are free to start and run themselves, inside rules AutoStacc sets and enforces.

## Spaces and channels

**Three kinds of space, one model.**
- **AutoStacc**: the platform's own space (announcements, help, feedback). Run by AutoStacc.
- **Project spaces**: the official space of a project that turns on the `"community"` feature (`data/projects.js` for first-party projects; a switch in the Studio for creators). Run by the project's creator team, using their team roles ([builder](builder.md) teams). Marked **Official**.
- **Communities**: started by any verified account, about a topic (production, a genre, gear) or a creator (then marked **Unofficial**). Run by their founder and the moderators they appoint.

**Channels.** Each space has channels, for example *Updates*, *General*, *Feedback*, *Show your Stacc*. Owners create, rename, order and archive them. Each channel says who may start threads in it (everyone, or the team only) and which post types it allows.

**Addresses.** `/community` lists spaces and latest threads. `/community/<space>` is a space, `/community/<space>/<channel>` a channel, `/community/t/<id>-<slug>` a thread, and `/community/rules` the base rules. A project space also appears at `/<creator>/<project>/community`, which is its canonical address. Space names are unique and permanent once used.

## Post types

- **Discussion**: anyone who can post in that channel.
- **Update**: an official announcement, posted only by the space's team, and in a project space by those with the publishing capability. A project's updates also appear on its news page and in followers' dashboards. This gives Studio creators the news posts that only `data/news.js` has today. First-party news can keep coming from `data/news.js` until it moves over (a later decision).
- **Poll**: posted by creators in their project space and by moderators in a community. It reuses the existing polls (`server/polls/`: one vote per verified account, changeable while open), extended so polls can be made from the Studio and the community, not only `data/polls.js`. Each poll has discussion under it.

## Rules

**Base rules (AutoStacc, everywhere, not negotiable).** Nothing illegal. No threats, harassment, hate, doxxing or sharing private information, sexual content involving minors, spam or scams, piracy (sharing paid packs or anyone's files without rights), or impersonation. Published at `/community/rules`, linked from the terms ([production](production.md): rules before features). The exact wording is drafted, then approved by the owner.

**Space rules (stricter only).** Each space can add its own rules, such as topic, tone, no self-promotion, or spoiler rules. They can only add limits, never allow what the base rules forbid. Each space shows its rules beside its threads.

**Who enforces what.**
- Space team (founder or creator team, and their moderators): pin, lock, hide and restore, move between channels, remove from their space, and ban someone from their space, for breaking either set of rules. Their actions are logged and visible to AutoStacc.
- AutoStacc admins (Control Center, [admin](admin.md)): base-rule reports from anywhere, suspending accounts from the community site-wide, removing moderators who abuse the role, closing communities that break the base rules, and appeals.
- Everyone: report a post (to the space team for its rules, to AutoStacc for base rules; the reason picks which), and block a person (their posts are folded for you).
- The author is always told when their post is hidden or removed, and why.

**Unofficial communities about a creator** can't use the creator's name alone as their name, or the creator's logo and artwork. Their header always says Unofficial and links to the official space if there is one. Impersonation reports go to AutoStacc.

## Proposed defaults (owner to confirm)

Communities can be started straight away, so to keep "less of a do-what-you-want":
- A cap on communities per account (for example 3), and new accounts wait a few days before starting one.
- Names are checked: reserved words (AutoStacc, admin, official), creator and project names unless it's theirs, and the same slurs filter as display names.
- A new community is `noindex` until it has some real activity, so empty or spam communities don't reach search engines.
- A community with no active moderator for a long time can be handed to a willing member by AutoStacc, or archived (read-only).

## Design (to be reviewed by the `architect` agent before building)

**Rendering.** Threads are user content, so they can't be static pages. Pages Functions render them on the server as escaped HTML with the normal head (canonical, Open Graph, `DiscussionForumPosting` JSON-LD). The browser script only adds posting and moderation controls. Thread URLs go into a sitemap the API generates. Hidden, removed and quiet threads are `noindex`, and user links carry `rel="ugc nofollow noopener"`.

**Formatting.** Text is stored as written and rendered by one shared, tested renderer: paragraphs, bold, italic, links, lists, quotes and inline code. It escapes everything else, so no HTML ever passes through (the no-creator-code rule in [creators](creators.md) applies to everyone).

**Data (D1, new migrations).** Spaces (kind, owner, official/unofficial, rules), channels, space roles (founder, moderator), space bans, threads (type: discussion, update, poll), posts and edit history, reports (routed to the space or AutoStacc), person-to-person blocks, site-wide suspensions. Moderation goes in the existing audit log. Each account gets a community display name, chosen once and checked for impersonation, never the email.

**Posting limits.** A confirmed email is required. New accounts get a few threads, replies and links per day, and the limits loosen as the account ages without action against it. Authors can edit for a short window (edits keep history) and delete their own posts.

**Privacy and legal (in the same change that builds it).** `/privacy` (`data/legal.js`) lists the new data (display name, posts, reports, blocks, roles). The terms point to the base rules. Account export includes your posts and communities.

## Open questions (ask the owner before building)

- When an account is deleted, are its posts removed or kept as "deleted user"? What happens to communities it founded?
- A minimum age for posting?
- Email when someone replies, or when a followed project posts an update?
- Reactions or votes on posts in v1, and ranking (newest vs most active)?
- The channels of the AutoStacc space (suggestion: Announcements, General, Production help, Feedback, Show your Stacc).
- Does first-party news (`data/news.js`) move to updates, or stay as it is?
- Mature (18+) communities: not chosen; none in v1.

## Build order

1. Architect review. Draft the base rules, privacy and terms text for the owner, then the migrations.
2. Read side: spaces, channels, thread pages rendered on the server, the sitemap, SEO tests.
3. Posting: display names, the formatter, verified posting, rate limits, edit and delete.
4. Moderation: reports routed to the space or AutoStacc, blocks, space bans, the Control Center queue, suspensions, audit. **The whole feature stays behind a switch (`community.forum`, off) until this step is done.**
5. Project spaces: the `"community"` feature, team roles, Official marks, updates on news pages and dashboards.
6. Polls from the Studio and communities.
7. Communities anyone can start: creation, founders and moderators, Unofficial marks, name checks, the proposed defaults above.
8. Later, asked for separately: notifications, reactions, images, showcases and challenges.

Each step runs `store-check` and the security, backend and SEO reviewers.
