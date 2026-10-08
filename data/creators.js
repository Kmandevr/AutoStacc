// Creators: who owns projects on AutoStacc and is the seller of record for what those projects sell. A creator's
// profile is autostacc.com/<id> and each of its projects lives at autostacc.com/<id>/<project>. The creators here are
// first-party: their projects' pages are hand-written in this repo (<id>/<project>.html and <id>/<project>/) and the
// build generates their profile page (<id>.html). Creators who sign up build their sites in the Studio (/studio);
// those live in the store database only. Both are synced into D1 `creators` (`node scripts/build.js` writes
// db/catalog.sql). Accounts are linked to a creator in the store, never here. Model: docs/creators.md.
// Fields:
//   id: lowercase-hyphenated, permanent: it is the address. Unique across all creators, ignoring case.
//   name: as the creator writes it. summary: one plain-text line for its profile page.
//   firstParty: true = run by AutoStacc itself, so it may use a reserved name (server/lib/slugs.js), like "autostacc".
//   draft: true keeps the creator and its projects out of the store database and off the site.
// Fees, payouts, quotas and the trusted flag are store records (D1 `creators`), set in the admin, not here.
window.CREATORS = [
  {
    id: "autostacc",
    name: "AutoStacc",
    summary: "AutoStacc's own projects.",
    firstParty: true
  }
];
