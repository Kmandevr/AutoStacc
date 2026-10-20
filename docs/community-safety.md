---
title: Community safety, legal and security
summary: PLANNED, rules and copyright pages published (owner, 2026-10-16): what the community and profiles must have before and after launch: the operator's legal setup and a DMCA agent, tiered copyright strikes, CSAM scanning, contest rules, UK/EU duties, urgent reports with false-report filtering, retention, legal requests, bot checks, and the security design rules.
updated: 2026-10-20
---

# Community safety, legal and security

> **Principle (owner):** the fewest legal duties possible. Space owners are accountable for moderating their spaces; AutoStacc does only what the law puts on the site operator, plus what is automatic or simple. A narrow topic (music and sound, ideas about products: [community](community.md)) and 16+ keep the risk low.

> **PLANNED / NOT IMPLEMENTED.** The owner's choices of 2026-10-16 for [community](community.md) and [profiles](profiles.md) ([decisions](decisions.md#2026-10-16-guides-and-community-forum-planned-owner)). Not legal advice: drafts are written by Claude from the site's real behaviour; the owner chose to have a lawyer review them **later**, not before launch.

## Before launch (gates: the `community.forum` switch stays off until these are done)

- [ ] **The operator's legal setup** (owner, tracked privately): done before the community goes live; terms, privacy and the footer (`data/legal.js`) updated to match.
- [ ] **DMCA designated agent** registered with the US Copyright Office ($6, renewed every 3 years), using a registered-agent or mail-service address (not the owner's home), and a dedicated copyright contact address. Without it, US protection for hosting uploads doesn't apply.
- [ ] **Cloudflare CSAM Scanning Tool** on for the zone that serves uploads, with the owner's notification email set; the NCMEC reporting steps written for the owner.
- [x] Published (owner chose now, 2026-10-16): `/community-rules` (base rules, spaces, moderation, reports, 16+; marked "opening soon"), `/copyright` (notices, counter-notices, tiered strikes; it already covers creators' uploads; notices to the support address until the DMCA agent is registered), the terms' pointer to both, and the privacy policy's legal requests (`data/legal.js`).
- [ ] Still to publish: contest rules (with challenges), and `/privacy`'s community data (with the change that first collects it).
- [ ] Written risk assessments for UK and EU duties (below).
- Lawyer review: later, by the owner's choice. Until then the terms keep saying they weren't drafted by a lawyer.

## Where it's open

Everyone, worldwide (owner), so the community meets the stricter rules:
- **EU (Digital Services Act):** a notice-and-action report form for illegal content, a statement of reasons for every removal or restriction (the author is always told why), a public contact point (the formal internal appeal system and most transparency duties don't apply to micro and small businesses under the DSA; to re-check if AutoStacc grows past that), and the terms explaining moderation, including that some flagging is automatic (keyword triage below). Small-company exemptions cover most transparency reporting; the yearly transparency note (below) covers the rest.
- **UK (Online Safety Act):** a written illegal-content risk assessment and a children's access assessment, kept up to date. With 16+ self-declared and no age verification (owner), the assessment has to rely on the site's adult and creator focus and the base rules forbidding content harmful to children. If the assessment can't conclude children are unlikely to use it, the child-safety duties apply. Flagged for the lawyer review.
- **US:** Section 230 covers user posts; DMCA covers copyright (above); COPPA is avoided by 16+ (the age question doesn't hint the answer; anyone who says they're under 16 can't post, and their community data is removed).

## Copyright: tiered strikes

A strike is a valid takedown notice that wasn't successfully disputed (counter-notice), **expiring after 12 months**. **Buying, downloading and using what you bought is never taken away.**

| Active strikes | Effect |
|---|---|
| 1 | A warning, nothing else |
| 2 | Selling is paused (Studio products, point items for sale). Can be disputed, and restored with some work (fix or remove the content, confirm the rules) |
| 3 | Text posting only: no selling, no uploads, no challenge entries, no point items, no Studio; links are stripped from their posts. An admin can keep this past expiry in serious cases |

Content named in a valid notice is removed promptly; the uploader can counter-notice, and the content is restored in the legal window if the claimant doesn't sue. Misleading notices are noted against the claimant.

## Uploads and child safety

- Uploads are narrow: challenge audio, creators' point items (images, animations, audio), and **avatars only** for regular users (banners come from presets and point items).
- Images re-encoded and stripped of metadata (location), no SVG, size and dimension limits, the [engine](engine.md)'s checks for audio.
- Images and animations scanned by Cloudflare's CSAM tool; a match is blocked, kept as US law requires, reported to NCMEC by the owner, and the account suspended.
- Every upload is reportable; removal also refunds points spent on a removed item ([profiles](profiles.md)).

## Challenges: contest rules

- **Free to enter, judged on skill** (owner): no purchase needed (a challenge pack is free to claim during the challenge), winners never drawn at random.
- Official rules generated for every challenge from its settings: dates, how it's judged, prizes (store items only), eligibility 16+, void where prohibited, entrants keep their rights and grant AutoStacc a licence to host and stream entries.
- **Vote rigging:** voters need an account at least 7 days old with a confirmed email; entrants can't vote for themselves; suspicious patterns (many new accounts voting alike) are flagged to the host and AutoStacc before winners are announced.

## Reports, emergencies and false reports

- **Who gets which report** (owner: legal minimum for AutoStacc): rule-breaking, harassment and danger reports go to the **space team**; illegal-content notices, copyright, CSAM and impersonation go to **AutoStacc**.
- **Danger reports** ("someone is in danger"): top of the space team's queue. People posting self-harm wording are shown crisis resources automatically (988 in the US, local lines elsewhere). No email to the owner (changed from the first plan). Built (#137): the crisis feature shows the note under the post itself, for everyone reading, from the shared word list in `server/community/core/wording.js`.
- **False reports filtered** (owner: "people will report for dumb things"): reporter trust (accounts older than 7 days; dismissed reports lower trust; abusers lose the danger option), a short written reason required, and keyword triage on our own server (nothing sent outside) to rank the queue.
- **Automatic hiding**: a post reported by **3** different trusted reporters is hidden until the space team decides. A **trusted reporter** is an account 7+ days old with fewer than 3 dismissed reports in the last 90 days (owner, 2026-10-16; settings, adjustable). Built (#137): only reports made since the post was last brought back count, a team member's own post is never hidden this way, reporters are anonymous to the team, and **2 dismissed danger reports in 90 days** take the danger reason away (`server/community/features/reports/trust.js`).
- **Inactive teams**: the space turns read-only by itself after 40 days ([community](community.md)), so reports never sit with nobody responsible.

## Records and requests

- **Retention:** removed content and reports kept privately for **12 months**, then deleted (built: `server/community/core/retention.js` in the daily sweep; content removed for a legal reason waits for AutoStacc's legal tools). **Account deletion wins** except for content removed for a legal reason (illegal-content notice, copyright, CSAM), which is kept privately for its 12 months or what US law requires; posts removed only for a space's rules go with the account (owner, 2026-10-16); moderation log entries stay with the audit log; anything reported to NCMEC is preserved as US law requires.
- **Legal requests:** user data only for valid legal process (subpoena, court order); the user is told unless the law forbids it or someone is in danger; emergencies involving a threat to life can be answered faster. A yearly transparency note counts requests, removals and strikes.

## Security design rules

- **No user code**: one escaping formatter; links only `http(s)`, shown with their domain, `rel="ugc nofollow noopener"`; display names and space names are plain text, checked for impersonation and look-alike characters.
- **Uploads** served from a separate address with locked-down headers (`Content-Disposition`, `nosniff`, no scripts), never from autostacc.com pages' origin.
- **Authorization** checked on the server for every action, scoped to the space (a moderator of one space can't act in another), creator-team capabilities reused; the browser is never trusted with votes, points or roles.
- **Support impersonation is read-only in the community**: while an admin views as a customer, posting, voting, friending, spending points and reporting are refused.
- **Moderator accounts**: two-step sign-in offered and encouraged for moderators, **not required** (owner). Instead every moderator action is logged and reversible by the space's founder, and mass actions are rate-limited.
- **Bots and abuse**: Cloudflare Turnstile on sign-up, starting a community and a new account's first posts (owner); rate limits and caps on posts, votes, Helpful, points earning and reports; points taken back on refund; blocks enforced everywhere (threads, Q&A, feed, friends, collab requests).
- **Privacy**: showcases and collecting badges are opt-in, because they reveal purchases; emails are never shown; profiles are `noindex` unless opted in.
- **Cost**: public thread pages cached; writes limited per account and per IP, so an attack can't run up D1 or R2 bills.
- **Streams aren't secret**: challenge audio is streamed, not offered as a download, but anyone can record what they hear; the terms say so.

Each build step runs the `security-reviewer` agent; the full set before the switch goes on.
