---
title: Community forum
summary: PLANNED / NOT IMPLEMENTED (owner, 2026-10-16): on-site discussions at /community and in each project that turns it on; verified accounts post text and links, creators and AutoStacc moderate, threads are public and indexed. Decisions, design and build order.
updated: 2026-10-16
---

# Community forum

> **PLANNED / NOT IMPLEMENTED.** Nothing here exists yet. This turns the open question "community features" in [vision](vision.md) §8 into a first version the owner chose on 2026-10-16 ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). The rest of §8 (challenges, showcases, collaboration invitations, ambassador programs) stays open. Support articles are [guides](guides.md).

## What the owner chose

| Question | Choice |
|---|---|
| First version | Discussions: threads and replies on the site |
| Where | A platform-wide `/community`, plus a space each project can turn on |
| Outside communities (Discord etc.) | None; everything is on autostacc.com |
| Who posts | Signed-in accounts with a confirmed email, with rate limits for new accounts; anyone can read |
| Who moderates | The project's creator team in their project's space; AutoStacc admins everywhere, and they alone handle reports and bans |
| What a post holds | Text with a small safe formatting set and links; no uploads |
| Visibility | Public and indexed by search engines; people appear by a display name only |

## Design (to be reviewed by the `architect` agent before building)

**Addresses.** `/community` (all spaces, latest threads, filter by project), `/community/<space>` for a space's threads, `/community/t/<id>-<slug>` for a thread, `/community/rules`. A project that turns it on also shows its space at `/<creator>/<project>/community`. The platform space and each project space are rows in the same tables.

**Opting in.** A project uses it through its features: `"community"` in `data/projects.js` for first-party projects, and a switch in the Studio for creators' projects. Never hard-coded to a project. The whole forum sits behind a feature switch (`community.forum`, off) until moderation is built.

**Rendering.** Threads are user content, so they can't be static pages. Pages Functions render them on the server as escaped HTML with the normal head (canonical, Open Graph, `DiscussionForumPosting` JSON-LD). The browser script only adds posting and moderation controls. Thread URLs go into a sitemap the API generates. Hidden, removed, or reply-less spam-flagged threads are `noindex`; user links carry `rel="ugc nofollow noopener"`.

**Formatting.** Text is stored as written and rendered by one shared, tested renderer: paragraphs, bold, italic, links, lists, quotes and inline code. It escapes everything else, so no HTML ever passes through (the no-creator-code rule in [creators](creators.md) applies to everyone).

**Data (D1, a new migration).** Spaces, threads, posts, edit history, reports, blocks (person to person), community suspensions, and a moderation log in the existing audit log. Each account gets a community display name, chosen once and checked for impersonation (no "AutoStacc", "admin", or a creator's name unless it's theirs). Never the email.

**Posting limits.** A confirmed email is required. New accounts get a small number of threads and replies per day and few links, and the limits loosen as the account ages without action against it. An author can edit for a short window (edits keep history) and can delete their own posts.

**Moderation.**
- Everyone: report a post (reason list), block a person (their posts are folded for you).
- A project's team (role capability, as in [builder](builder.md) teams): pin, lock, hide and restore, move threads within their space, from the Studio.
- AutoStacc admins: all of that everywhere, plus the reports queue, suspending accounts from the community, and the audit trail, in the Control Center ([admin](admin.md)).
- Every action is logged, and the author is told when their post is hidden or removed.

**Privacy and legal (in the same change that builds it).** `/privacy` (`data/legal.js`) lists the new data (display name, posts, reports, blocks). Community rules go at `/community/rules`, and the terms point to them. Account export includes your posts. What happens to posts when an account is deleted is an open question (below).

## Open questions (ask the owner before building)

- When an account is deleted, are its posts removed or kept as "deleted user"?
- A minimum age for posting?
- Email when someone replies, or only on-site?
- Reactions or votes on posts in v1?
- The first categories of the platform space (for example: General, Production help, Feedback, Show your Stacc, AutoStacc announcements).

## Build order

1. Architect review of this design. Write the community rules, privacy and terms text, then the migration.
2. Read side: spaces, thread list and thread page rendered on the server, sitemap and SEO tests.
3. Posting: display names, the formatter, verified-email posting, rate limits, edit and delete.
4. Moderation: reports, blocks, the Control Center queue and suspensions, the creator team's tools in the Studio, audit. **The feature switch goes on only after this step.**
5. Project spaces: the `"community"` feature and `/<creator>/<project>/community`.
6. Later, asked for separately: notifications, reactions, images, showcases and challenges.

Each step runs `store-check` and the security, backend and SEO reviewers.
