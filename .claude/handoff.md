# Handoff: guides (#134), paused by the owner 2026-10-16

The owner paused this to fix dependencies first. Resume only when they say so.

- Branch `ccr-4c5e875c-kzqkhd`, PR #141. It started as the docs-only plan (community, profiles, safety, guides). The guide work is now on it too, so #141 isn't docs-only any more: either finish the guide and retitle it, or split it.
- Squash-merge #141: earlier commits named the owner's private legal plans (since reworded in the notes).
- Built: `data/guides.js` (12 articles), `scripts/lib/guide-pages.js`, `data/guide-index.js` (generated), `js/guide-search.js`, `css/guide.css`, extra blocks in `scripts/lib/rich-text.js`, links (footer, help, contact, Studio), reserved slugs, `scripts/dist.js` ships `guide/`, `scripts/seo-test.js` covers `/guide`.
- Checked: `node scripts/build.js`, `node scripts/seo-test.js` (0 fail), `npm test` (159 pass), `node scripts/docs-test.js`.
- Next: merge `main` in, rebuild, review each article against the code (`docs/guides.md` names the source notes), run `verify-site`, `npm run test:store` (the reserved-slug unit test is in it), `release-check`, then update #141 and close #134.
- Issues #135–#140: the community and profiles build steps, after the guide.
