---
title: Profiles, points and friends
summary: PLANNED / NOT IMPLEMENTED (owner, 2026-10-16): Steam-style public profiles (Stacc showcase, badges, creations, customisation), points earned by buying and taking part and spent on profile items creators make (creators get a share, never cash), friends, a friends-only feed and collab requests; no direct messages.
updated: 2026-10-16
---

# Profiles, points and friends

> **PLANNED / NOT IMPLEMENTED.** Nothing here exists yet. Chosen by the owner on 2026-10-16 with the [community](community.md) plan ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). Built after the community's moderation is in place.

"Like Steam" (owner): people can show off their account, buying and taking part are a bit of a game, and people can connect one to one without AutoStacc becoming social media.

## Profiles

Everyone 16+ with a confirmed email can have a public profile. **Every part is opt-in and private by default.**
- **Showcase of their Stacc**: favourite items they own, plus counts (packs owned, projects followed). Never prices, orders or dates of purchase.
- **Badges and achievements**: challenge entries and wins, accepted answers, streaks (weekly prompts), collecting (for example "owns every pack of a project"), years on AutoStacc.
- **Creations**: challenge entries, Show your Stacc posts, and links to their own creator projects.
- **Customisation**: free choices are decent on their own (an uploaded avatar, preset banners, accent colour, featured badge, short bio, layout from presets). Regular users upload an **avatar only**; banners come from presets and point items ([community safety](community-safety.md)). Point items add more. No custom HTML or CSS, ever: everything is preset blocks and checked files.
- Address: proposed `/u/<display-name>` (so it never collides with `/<creator>`), `noindex` unless the person opts in to search.

## Points

- **Earned**, never bought: purchases (proposed 100 points per $1, taken back on refund), badges, helping (accepted and Helpful answers, capped per day so they can't be farmed), and taking part (challenge entries and wins, weekly prompts).
- **Spent** on profile items: backgrounds, avatar frames, cosmetic badges and stickers, themes (preset colour tokens), animated backgrounds and short profile sounds.
- **No money value, ever** (owner): not bought, not cashed out, not paid out. This keeps it a game and avoids money-transmitter, tax and gambling rules. Points are a ledger in D1 (every earn and spend is a row), never a balance the browser sends.
- Proposed: points can't be transferred or traded between people (no market to abuse); gifting an item to a friend is an open question.

## Point items made by creators

- Creators make items in the Studio from their own artwork, palette and sounds.
- When someone spends points on a creator's item, **the creator gets a share of those points** (owner: about half; a setting AutoStacc can change). Creators spend their points like anyone else, or on AutoStacc perks such as a featured spot (to be defined).
- **Checks**: automatic (type, dimensions, size, length, the [engine](engine.md)'s safety checks), then live straight away. Reports go to AutoStacc, which can remove an item and refund the points spent on it.
- **Storage**: audio and animations are allowed. Item files over a set size count toward the creator's storage cap ([creators](creators.md), [builder](builder.md)).
- Items belong to profiles only: they never change what someone owns in the store, and points never buy store products (proposed, to keep the store's pricing and payments separate).

## Friends and connecting

- **Friends list**: mutual requests, both must accept. Friends can see the profile parts set to friends-only. No follower counts and no public friend tally.
- **Friends-only activity feed**: what friends did (a new badge, a challenge entry, an answer). In time order, no algorithm, no likes, no endless scroll. Each person chooses what appears.
- **Collab requests**: a structured request (what, which project, a short note) that the other person accepts or declines. It ties into collaboration in [vision](vision.md) §5. It's not open chat.
- **No direct messages** (owner): the heaviest thing to moderate and the most social-media-like.
- Blocking someone ([community](community.md)) also removes them as a friend and stops their requests.

## Privacy

Showcases and collecting badges reveal what someone bought, so they're opt-in and shown only at the level chosen (public, friends, only me). `/privacy` (`data/legal.js`) lists profiles, points, items, friends, the feed and collab requests in the same change that builds them. Account export includes them. Deleting an account erases them (posts stay as "deleted user", per [community](community.md)).

## Open questions

- Can friends gift point items to each other?
- What creators' points can buy beyond items (which AutoStacc perks)?
- The exact earn rates and daily caps.
- Can people who aren't creators make point items?

## Build order (after the community's moderation)

1. Profiles with the free customisation and privacy levels; badges.
2. Friends, blocking together with community blocks, the friends-only feed, collab requests.
3. The points ledger and earning (purchases with refunds, badges, helping, taking part).
4. AutoStacc's own point items, then creator-made items, the creator share, checks and storage counting.
