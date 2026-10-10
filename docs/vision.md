---
title: Vision and product principles
summary: Owner-written vision for AutoStacc as a connected creative ecosystem: identity hierarchy, builder, store, collaboration, purchase permanence, licences, trust and safety, programs, and the open-questions register. Guides decisions; not a spec.
updated: 2026-10-10
---

# AutoStacc vision, product principles and working direction

**Status:** working identity document, living draft. Owner-written, last updated by the owner 2026-10-09; added to the vault 2026-10-10.

Not to be confused with [identity](identity.md), which is the Glitches & Stitches project's creative identity. This note is the platform's long-term vision; [autostacc](autostacc.md) is its current vocabulary and look, [architecture](architecture.md) and [creators](creators.md) say what is built. Where this note and the code disagree, the code says what exists; see [Relation to the repository today](#relation-to-the-repository-today).

## Purpose

This document establishes what AutoStacc is, what it aims to become, and which principles should guide product and technical decisions. It helps developers and AI coding agents understand the vision without repeatedly rediscovering it or inventing new interpretations.

This is not a final specification, legal agreement, or complete implementation plan.

- **Established direction:** reflects the current product vision.
- **Working proposal:** a recommended approach that can guide development until finalized.
- **Open question:** a decision that remains unfinished.

Do not present unfinished policies as finalized commitments. Do not claim a proposed feature exists until verified in the actual application and repository.

## 1. Core identity

AutoStacc is a connected creative ecosystem for music producers, artists, and other music creators. It gives creators a place to establish an identity, present their work, publish music, collaborate, discover other creators, and buy or sell creative products.

AutoStacc combines a digital marketplace with customizable creator websites, project websites, music and product discovery, collaboration, publishing, and community features.

The goal is for people to create, share, discover, and buy music-production work in one connected place rather than stitching together disconnected services.

AutoStacc should feel like a **bottomless pit of discovery**. Someone might arrive looking for one sample pack and continue discovering producers, projects, tracks, tutorials, collaborations, and other products through meaningful connections.

Discovery should feel expansive without becoming random, manipulative, or exclusively driven by popularity.

The platform should combine:

- **Professional foundations:** reliable publishing, clear permissions, secure commerce, accurate records, and trustworthy purchases.
- **Creative freedom:** distinctive identities, expressive layouts, unusual concepts, and room for creators to tell their own stories.
- **Playfulness:** personality, delightful details, experiments, and fun where they enhance the experience.
- **Accessibility:** beginners can get started while experienced creators can make sophisticated spaces.
- **Performance:** a responsive product that avoids unnecessary work, complexity, and resource consumption.
- **Connection:** creators, projects, products, releases, and collaborators reinforce one another.

### Long-term ambition

AutoStacc may eventually grow into a broader hub for creative work. The immediate focus is music production and its surrounding ecosystem. Build for reasonable expansion without letting speculative features undermine the current product.

### Core identity statement

AutoStacc gives creators a home, the freedom to express their identity, and a connected place to share, discover, and sell their work.

It combines a digital marketplace with customizable creator and project websites, music publishing, and collaborative creative spaces.

AutoStacc should be reliable enough for serious work, flexible enough for unconventional ideas, and welcoming enough for beginners. The platform should handle infrastructure such as security, commerce, permissions, and reliable publishing so creators can focus on creating.

## 2. The identity hierarchy

This is a hierarchy of organization and discovery, **not a rule that one identity automatically owns another**.

### 2.1 User account

A user account is the private operational identity used to sign in and manage access. It can hold:

- Authentication and account security.
- Personal settings and privacy choices.
- Purchases, entitlements, and transaction history.
- Notifications and account-level preferences.
- Memberships and permissions for creator identities and projects.
- Relevant account data and security records.

An account is not necessarily a public-facing creator identity.

### 2.2 Creator identity

A creator identity is a public creative home for a person or creator brand.

**Creator pages should have as much expressive freedom as project websites.**

They may include:

- Custom visual identity, layout, typography, colors, backgrounds, banners, and navigation.
- Biography, story, creative philosophy, and portfolio.
- Music, releases, work samples, announcements, and updates.
- Links to projects the creator owns, operates, or contributes to.
- Collaborators, credits, and related creator identities.
- Products and storefront features when relevant.
- Multiple pages and different ways to organize work.

A creator should be able to build a meaningful page without selling anything. A musician might simply want a distinctive home for their music and portfolio.

### 2.3 Projects

A project is a distinct creative identity or undertaking, such as:

- An artist or producer project.
- A sample-pack or preset brand.
- A record label or collective.
- A release, album, or ongoing creative experiment.
- Another music-related identity that benefits from its own website and collaborators.

A project can have its own branding, pages, content, products, releases, collaborators, announcements, and navigation.

A project should be a **mini-website**, not merely a profile or product list.

### 2.4 Content and commerce

Underlying records may include tracks, releases, sample packs, presets, MIDI files, other supported digital products, licenses, purchases, and entitlements.

A product should have one authoritative record even if it appears on a creator page, multiple project websites, the Store, and other discovery surfaces. Showing a product in multiple places must not create duplicate products or conflicting prices, licenses, or purchase histories.

### 2.5 Permissions must remain distinct

The system must not assume that:

- A project editor owns the project.
- A collaborator owns all content they helped create.
- A public credit grants intellectual-property rights.
- A website designer can change payout details.
- A creator identity automatically owns every linked project.
- A project owner automatically owns a contributor's personal identity or pre-existing work.

Ownership, website editing, publishing, product administration, financial control, and intellectual-property rights are different concepts.

**Established direction:** one person can have multiple projects and collaborate on projects they do not own.

**Working proposal:** use role-based permissions separating ownership, editing, publishing, product management, and financial administration. Exact roles and the permission matrix remain to be designed.

## 3. Creative websites and the builder

The builder lets people create a free identity and home for themselves or a project. It is not a general-purpose application builder or unrestricted code-hosting environment.

### Creative freedom

Creator and project websites should support substantial customization:

- Multiple pages and navigation.
- Custom themes and global styles.
- Colors, typography, backgrounds, banners, and layout.
- Music players, portfolios, product displays, collaborators, news, events, and other supported components.
- Storytelling and expressive interactions.
- Professional, minimal, playful, experimental, or unconventional aesthetics.

A site should not be forced into a single template or into selling products. Templates should help people get started, not impose a permanent ceiling on expression.

### Progressive complexity

The experience should work for different skill levels:

1. Quick-start layouts and templates for beginners.
2. A visual editor for normal customization.
3. Advanced layout and interaction options for experienced users.

Useful builder capabilities may include live preview, responsive layouts, drafts and publishing, undo/redo, version history, reusable components, asset management, accessibility support, and performance-conscious media handling.

**Working proposal:** prioritize making the visual editor useful and production-ready before expanding advanced features. Do not confuse greater freedom with allowing arbitrary executable code.

### Security boundaries

AutoStacc should own the infrastructure for authentication, commerce, permissions, and publishing. User-created pages should be rendered through trusted platform components and validated configuration.

By default, the builder should not allow arbitrary JavaScript, server-side user code, direct access to private account data, custom payment logic, or unrestricted database access.

Embeds and uploads should be constrained and validated. Styling should be appropriately scoped. Protect against malicious content, deceptive interfaces, and attempts to imitate trusted payment or login UI.

The goal is **maximum useful creative freedom within safe, maintainable boundaries**.

## 4. The Store and connected discovery

The Store should feel like a real storefront, not a plain list of files. It should support product presentation, browsing, comparison, and discovery while preserving clear, authoritative product information.

### Store principles

- Products need clear descriptions, previews where appropriate, contents, formats, compatibility information, and licenses.
- Creators should be able to customize how products are presented on their own pages.
- Custom presentation must not bypass or falsify official pricing, checkout, license terms, or purchase records.
- A product may be discoverable in several contexts while remaining one canonical record.
- Products should not be the only thing a creator can publish or showcase.
- Store promotions and sales should be transparent so creators understand how they affect products and earnings.

The exact sale and promotion system remains a separate design task.

### Discovery should connect the whole ecosystem

People should be able to explore:

- Products and product categories.
- Creators and portfolios.
- Projects, labels, collectives, and artist identities.
- Tracks, releases, and music.
- Collaborations and contributors.
- Tutorials, showcases, challenges, and other community content where supported.

A discovery path might begin with a preset pack, lead to a track made with it, then to the producer's creator page, a collaborative project, another artist, and further products or music.

**Established direction:** AutoStacc should feel connected and expansive, with many meaningful paths for discovery.

**Working proposal:** recommendations should balance relevance with opportunities for new and smaller creators to be discovered. Popularity should not be the only signal.

The recommendation algorithm, ranking signals, safeguards, and creator controls remain to be designed.

## 5. Collaboration and shared work

Collaboration should be a first-class part of the platform rather than an informal note on a profile.

Potential capabilities include:

- Inviting contributors to projects.
- Assigning distinct roles and permissions.
- Crediting contributors.
- Documenting rights and permissions for contributed assets.
- Recording agreed revenue shares for products.
- Showing collaborative work on relevant creator and project pages.
- Keeping one authoritative record for each shared product or release.

A contribution, credit, or project membership should not silently transfer intellectual-property ownership. Pre-existing work should remain with its rights holder unless an explicit agreement says otherwise.

For paid collaborative products, relevant rights, permissions, and revenue arrangements should be documented before release. Revenue splits should be handled through platform accounting rather than relying on one collaborator to pay everyone manually.

**Working proposal:** preserve the original agreement and transaction history. Do not allow one collaborator to silently rewrite another's revenue share or permissions. Provide a structured way to resolve disagreements.

The exact agreement flow, supported split types, and dispute process remain in progress.

## 6. Purchase permanence and licensing

### Foundational direction

AutoStacc should operate on the principle that **buying a product should provide lasting value**.

A subscription ending, a seller leaving, or a listing disappearing should not by itself erase rights already validly granted to a customer.

The intended customer experience:

- Purchased files can be kept and used permanently, subject to applicable law and the purchase license.
- A perpetual license does not automatically mean the customer owns the creator's copyright.
- Licenses clearly explain permitted uses and restrictions.
- Buying a sample pack does not automatically grant permission to resell or redistribute the original sample files.
- Product updates are included only where promised at purchase or subsequently provided.
- Existing purchase terms should not be silently replaced by a later change to a listing's license.

Purchase records should preserve the product version, applicable license and terms version, transaction, and entitlements.

### Important qualification

This is a product principle, not finalized legal language. AutoStacc must not promise rights that a seller does not possess or that applicable law does not allow.

Legal orders, legitimate third-party rights, fraud, or other legally necessary restrictions may require action. Exceptions should be handled carefully, explained where appropriate, and limited to what is necessary.

Downloaded files and the rights granted by a license are distinct from continued access to AutoStacc's online services. Support portability and durable records, but do not promise the platform or every online feature will exist forever.

### License categories under consideration

These categories are a working model. Their precise terms, platform enforcement, and legal wording are **not finalized**. Every product should display the license that actually applies to it.

#### Free License

A product is available at no cost under the stated terms. Free does not automatically mean commercial use is permitted.

#### Community License

Intended to help people use participating products in community content, tutorials, challenges, and other permitted creative activity.

Current direction includes allowing creators to monetize eligible videos or content featuring a product, while not allowing the resulting music itself to generate income under this license.

This distinction needs careful definition, particularly where streaming platforms automatically monetize tracks or claim rights through automated systems.

#### Education License

Intended for learning, classroom, and student use.

The goal is to support practice and educational projects without permitting commercial exploitation of licensed assets. It should not prohibit students from creating music generally.

A small opt-in pilot may be a sensible starting point.

#### Commercial License

Intended to permit monetized music and other commercial uses explicitly described by the license.

It should clearly distinguish using samples in a production from reselling or redistributing original sample assets.

These are category concepts, not final legal terms. Product creators must have a clear way to choose applicable licenses, and customers must understand the terms before buying or downloading.

### Optional creator partnership program

A potential opt-in program may allow AutoStacc's operator to use participating creators' samples in original commercial music.

Working safeguards:

- Creators retain the intellectual property they own.
- The grant should be non-exclusive unless a separate agreement clearly says otherwise.
- Permission to use samples in music is distinct from permission to use a creator's name, likeness, logo, or branding in advertising.
- Creators should only submit material they have the right to license.
- Participation should not be required for ordinary founding status or general access to AutoStacc.

**Open question:** whether permission covers all of the operator's commercial music or only specified releases and projects remains undecided.

## 7. Trust, safety, and dispute resolution

**Established direction:** AutoStacc should protect legitimate creative rights, customer purchases, and community trust through clear rules and fair processes, not arbitrary platform control.

These are working proposals, not a complete or final legal policy.

### 7.1 Copyright and unauthorized work

AutoStacc needs a clear process for reports of stolen samples, unauthorized releases, copied branding, and other intellectual-property disputes.

Proposed process:

1. A reporter identifies the content and explains the alleged issue.
2. AutoStacc reviews the report and requests supporting information where appropriate.
3. Where evidence or risk justifies it, AutoStacc may temporarily restrict a disputed listing or new sales while reviewing the matter.
4. The uploader is notified when appropriate and has an opportunity to respond, subject to legal requirements and urgent safety considerations.
5. AutoStacc takes action proportionate to the evidence, applicable law, and its policies.
6. Affected parties have a reasonable way to request review or appeal where appropriate.

Legally mandated takedowns or urgent situations may require a different process.

#### Preferred default: balanced approach

New sales may be paused during a credible dispute when justified.

Existing customers generally retain access to downloaded files and valid licenses, but narrowly tailored restrictions may be necessary where serious legal or security risks, valid third-party rights, or applicable law require them.

Removing a listing must not automatically mean every previous purchase is invalid. Conversely, permanent-purchase principles must not justify continuing unlawful distribution.

Distinguish listing availability, file access, and rights granted by the applicable license.

### 7.2 Fraud and misleading listings

Potential safeguards should address:

- Products that are never delivered.
- Corrupted, materially misrepresented, or unusable files.
- Misleading descriptions or compatibility claims.
- False claims of ownership or licensing authority.
- Fake reviews, manipulated sales signals, and impersonation.
- Malicious files or unsafe downloads.

Possible tools include listing requirements, secure upload processing, malware scanning, transaction and download records, reporting tools, risk-based review, and proportionate seller restrictions.

Do not claim every upload is manually inspected unless the service actually provides that review.

### 7.3 Refunds and payment disputes

Customers need a clear route to seek help with missing, corrupted, incorrectly delivered, or materially misrepresented products. Creators need protection against abusive refund behavior.

Working principles:

- Explain refund eligibility before purchase.
- Follow applicable consumer-protection law.
- Allow sellers to respond to relevant disputes where appropriate.
- Investigate repeated or clearly abusive refund patterns.
- Reflect refunds and chargebacks accurately in accounting and revenue shares.
- Do not treat disputed funds as unquestionably settled.
- Keep records sufficient to explain transaction decisions.

Refund windows, exact eligibility rules, reserve policies, and processor-specific requirements are still to be designed.

### 7.4 Impersonation and community abuse

Creative freedom should not become a way to deceive or harm people.

Rules and tools should address impersonation, targeted harassment, spam, malicious links, fraudulent collaboration invitations, and deceptive branding.

Potential safeguards include reporting and blocking, appropriate identity or ownership verification, extra verification for sensitive actions such as payout changes, and an appeal path for consequential moderation decisions.

Public creative identity should be separate from private verification. A person should be able to use a stage name publicly while completing appropriate private verification for payments or other sensitive operations.

Moderation should distinguish artistic expression and unusual aesthetics from actual abuse or deception.

### 7.5 Collaboration and revenue disputes

For shared products, records should identify relevant contributors, granted permissions, rights arrangements, agreed revenue shares, management roles, and who may publish or change the product.

Working principles:

- Preserve the agreement and relevant transaction history.
- Do not allow one collaborator to silently alter another contributor's agreed share or permissions.
- Offer a structured dispute process.
- Where justified and legally permitted, consider narrowly scoped temporary restrictions or holds on genuinely disputed funds.
- Avoid unnecessarily freezing unrelated earnings, products, or customer purchases.
- Do not treat a public credit as proof of ownership or entitlement to revenue.

The exact process, evidence requirements, timeframes, and handling of disputed funds remain open work.

### 7.6 Proportionate enforcement and appeals

Enforcement should match the seriousness and credibility of the issue.

Where appropriate, decisions should explain the reason for a restriction and how to seek review. Appeals should be meaningful, not merely decorative.

AutoStacc cannot guarantee every decision will satisfy every party, but it should aim for consistent rules, useful records, clear communication, and fair consideration of evidence.

## 8. Community and creator programs

Community should help people learn, share work, discover creators, and collaborate.

Potential features include follows, release notifications, announcements, comments or discussions, challenges, showcases, and collaboration invitations.

These features require moderation, reporting, blocking, privacy controls, and anti-spam measures. The exact community feature set and launch order remain in progress.

### Founding participants

A possible early-adopter structure has been discussed:

- First 100 Founding Members.
- First 20 qualifying Founding Creators.
- Approximately 5 Founding Partners.

These numbers and labels are **provisional**, not finalized commitments.

Potential benefits include badges, early access, spotlights, feedback opportunities, and collaboration opportunities.

Avoid promising lifetime discounts, unlimited storage, guaranteed sales, guaranteed feature development, equity, or permanent free products unless a separate explicit policy is deliberately adopted.

Founding status alone should not imply ownership of AutoStacc.

### Education program

A possible education program could begin with a small free classroom pilot and creators who opt individual products into educational use.

Later tiers for schools or institutions may be considered after the pilot teaches us what is needed.

Program eligibility, graduation or course-end treatment, product access, and any future paid tiers remain open questions.

### Community and influencer program

A potential program may let eligible users access opted-in products for tutorials, challenges, noncommercial tracks, and public demonstrations, with selected ambassadors or influencers receiving additional curated access.

Attribution could be generated automatically, linking to the creator, product, and AutoStacc.

The exact rules for monetized videos, track income, automated claims, attribution, and creator eligibility still need careful definition.

These programs should create a healthy discovery loop: creators publish work, people use it and share what they make, audiences discover the original creators and products, and interested customers can choose an appropriate license.

## 9. Creator economics and platform sustainability

Creators should be able to understand how money moves through AutoStacc.

Long-term design should account for:

- Transparent platform fees.
- Clear payout calculations and transaction histories.
- Documented revenue splits.
- Refunds, chargebacks, and relevant adjustments.
- Accurate purchase and entitlement records.
- Clear disclosure of promotion or sale terms.
- No misleading promises of sales or earnings.

The business model is not finalized. Transaction fees, optional paid services, subscriptions, bundles, and other possibilities may be explored, but should not be represented as settled policy.

### Free access

A free basic identity and project presence is an important direction. It should be possible to create a meaningful public home without selling anything.

Free infrastructure still has real storage, bandwidth, and processing costs. Any usage limits should be understandable and transparent. Avoid artificial obstacles that exist only to frustrate users into paying.

The exact free-tier limits and paid boundaries remain to be decided.

## 10. Creator independence and portability

AutoStacc should provide value because the ecosystem is useful, not because users are trapped.

Where feasible, creators should be able to:

- Download original files they uploaded.
- Export relevant project content and metadata.
- Retrieve purchase and licensing records.
- Understand what happens to their content when an account or project changes status.
- Preserve files and valid license records even if a listing is removed or a creator leaves.

A full export that reproduces a functioning AutoStacc website may not always be feasible. Be precise about what can be exported and avoid implying every platform feature can run independently outside AutoStacc.

Export formats, account closure, backups, and data retention remain to be designed.

## 11. Reliability, performance, and engineering principles

AutoStacc's creative experience depends on a reliable technical foundation.

Engineering should prioritize:

- Responsive navigation and editing.
- Efficient handling of large media and downloads.
- Lazy loading and appropriate caching where useful.
- Efficient search and discovery.
- Reliable publishing and safe recovery from failed changes.
- Backups and version history where appropriate.
- Purchase and entitlement recovery.
- Clear monitoring, useful error reporting, and outage communication.
- Automated tests for critical user journeys, permissions, payments, licensing, and publishing.
- Modular architecture that allows features to evolve without forcing unrelated parts of the application to be rewritten.

Do not introduce complexity merely because a future feature might eventually need it.

Prefer simple, well-separated components and clear contracts. Add abstractions when they solve a real problem or make likely changes safer.

Security, permissions, financial records, and purchase entitlements deserve particular care because mistakes in those areas can harm users.

Specific technical architecture and performance targets belong in engineering plans and implementation documents, not in this identity document unless they become enduring product commitments.

## 12. What AutoStacc should not become

AutoStacc should avoid drifting into:

- Just another sample-pack list or storefront.
- A generic social network disconnected from music creation.
- A rigid template system that makes every creator's page look the same.
- An unrestricted code-hosting or arbitrary application-building platform.
- A collection of disconnected tools with duplicated identities and product records.
- A system that creates artificial lock-in around creators' files or customers' purchases.
- A popularity contest where established creators permanently dominate discovery.
- A product that expands endlessly while core workflows remain unreliable.
- A platform that treats creative freedom as permission to ignore security, rights, or user safety.
- A platform that uses legal-sounding promises before its actual policies and capabilities can support them.

Automation should expand what creators can do, not dictate what they create.

## 13. How to use this document when building AutoStacc

This document guides product and engineering decisions. It does not replace repository technical documentation, the issue tracker, implementation plans, or formal legal policies.

When considering a feature or code change:

1. Identify which real user need it serves.
2. Check whether it supports AutoStacc's creative ecosystem and connected discovery.
3. Preserve the distinction between accounts, creator identities, projects, content, products, permissions, and rights.
4. Avoid duplicating authoritative product, payment, license, or purchase records.
5. Preserve security and privacy boundaries.
6. Prefer modular, testable implementations over sprawling changes.
7. Prioritize the production experience and critical workflows over speculative scope.
8. If a requirement is unclear, record the question rather than silently inventing a permanent policy.
9. Distinguish what exists today from what is planned or merely proposed.
10. Add tests for behavior that matters, especially security, publishing, purchases, licensing, and permissions.

### For AI coding agents

Do not interpret this document as permission to implement every idea listed here immediately.

- **Established direction** describes the current vision.
- **Working proposal** suggests a default approach that may guide planning and prototypes.
- **Open question** means the decision is not final.
- Proposed features must not be reported as implemented unless they exist and have been verified in the repository.
- Do not invent legal terms, commercial promises, pricing, performance measurements, or launch dates.
- When a major decision is needed, state the trade-offs and ask for clarification if the decision cannot safely be deferred.
- Given limited development time or model usage, focus on the highest-value production gaps and working end-to-end flows rather than broad speculative expansion.
- Keep this document focused on identity and enduring principles. Track current implementation status, launch blockers, and priorities in a separate roadmap (in this repository: GitHub Issues, per the `tasks` skill).

## 14. Decisions and open questions register

### Established direction

- AutoStacc is currently focused on music production and its surrounding creative ecosystem.
- The long-term ambition is broader, but current product quality comes first.
- Creator pages and project pages should both allow substantial creative freedom.
- Creator pages link to projects the creator owns or participates in.
- The account, creator identity, project, content, and commerce layers must be distinct.
- The ecosystem should connect creation, publishing, discovery, collaboration, buying, and selling.
- The Store should feel like a real storefront, not a plain list.
- A product should have one authoritative record even when shown in multiple places.
- The builder is for expressive websites and identities, not unrestricted custom applications.
- Security, privacy, permissions, performance, and modularity matter from the beginning.
- Permanent purchases and clear license terms are foundational product principles.
- For credible rights disputes, the preferred default balances rights holders' interests with existing customers' valid purchases.

### Working proposals

- Role-based permissions separating editing, publishing, product administration, ownership, and financial control.
- Progressive complexity in the website builder.
- Discovery recommendations balancing relevance with exposure for emerging creators.
- Structured processes for copyright, fraud, refund, impersonation, moderation, and collaboration disputes.
- Proportionate enforcement and meaningful appeals where appropriate.
- A small opt-in education pilot and optional community/creator programs.
- Clear portability and reliable purchase/license records.
- Modular engineering and test coverage around critical flows.

### Open questions

- Final legal wording and enforceable terms for all license categories.
- Detailed Community License rules, including automatically monetized tracks and third-party platform claims.
- Exact scope of the optional sample-use partnership permission.
- Refund windows, eligibility, chargeback handling, and disputed-fund policies.
- Copyright-reporting and appeal procedures, including deadlines and evidence standards.
- Final project and creator permission roles.
- Revenue split options and collaborator dispute workflows.
- Founding program names, participant limits, eligibility, and benefits.
- Education program eligibility, access duration, and any future pricing.
- Community features, moderation details, and influencer/ambassador criteria.
- Free-tier limits, platform fees, payout policies, and the eventual business model.
- Data-export formats, account closure, and retention policies.
- Recommendation signals, ranking controls, and measurable discovery goals.
- Current implementation status of each idea. This must be verified against the live repository and application rather than assumed from this document.

## Closing principle

AutoStacc should make it easier for creators to express who they are, connect their work, find an audience, collaborate fairly, and sell with confidence.

It should give customers clarity about what they are buying and respect the rights that were actually granted.

The platform should feel expansive and playful on the surface, with dependable infrastructure underneath.

**Build the connected creative home first. Expand thoughtfully. Protect trust. Keep the creator at the center.**

## Relation to the repository today

Checked against the vault on 2026-10-10. The vision above is the direction; these notes say what is built and where earlier owner decisions already settle (or differ from) a point above. Until the owner says otherwise, a dated decision in [decisions](decisions.md) wins over an open question here.

- **Account / creator / project layers (§2):** creators are their own entity with members by account, separate from projects; addresses are `/<creator>/<project>` ([creators](creators.md)). Projects are data with Stacclets and Pacs ([architecture](architecture.md)). Role-based permissions beyond creator membership are not built.
- **Builder (§3):** the Studio builds free, block-only sites with no creator code; custom HTML/CSS (later JavaScript) is a separate, unbuilt plan that would run only in a sandbox on another origin ([creator-pages](creator-pages.md)). This matches "no arbitrary executable code by default".
- **One authoritative product record (§2.4, §4):** products live once in `data/products.js` (first-party) or D1, with the price always set by the server ([store](store.md)).
- **Licences (§6):** today's licences are per kind of product (`sounds`, `stems`, `music`, `visuals` in `data/licenses.js`, [production](production.md#licences)), not the Free / Community / Education / Commercial categories above, which are under consideration only.
- **Platform fee (§9):** the vision calls fees open; the owner has already set a 20% default fee per creator sale (decision 2026-10-09, [creators](creators.md)).
- **Sales and promotions (§4):** built as admin-created promotions ([admin](admin.md)); the creator-facing transparency side is not.
- **Discovery (§4):** search, filters and recommendations exist for the store ([discovery](discovery.md), [browse](browse.md)); creator, collaboration and community discovery do not.
- **Product contents, file integrity and portability (§4, §6, §7.2, §10):** the processing engine's Phase 0 is built (safe archive reading, SHA-256 per file, formats and facts from file contents; [engine](engine.md)) but not yet used by the site; the Pack Builder, folder-level downloads and contents-derived store details are planned in [packs](packs.md), which lists how it follows this vision. On §6 the owner decided: buyers keep what they downloaded, removed or replaced files in a revision stay downloadable for 30 days, and files are stored once, git-style ([decisions](decisions.md)).
- **Not built:** collaboration and contributor roles (§5), purchase-time licence/terms versioning (§6), reporting, disputes and appeals (§7), community and founding programs (§8), creator export (§10).
