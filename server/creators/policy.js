// The free plan's limits, in one place: what any creator gets without paying. They keep storage and abuse bounded;
// they are not prices. A creator's own quota or platform fee (D1 `creators`, set by an admin) overrides the default.
// Paid plans, when they exist, will be rows that raise these, not new code paths.
export const LIMITS = {
  creatorsPerAccount: 1,
  // People on a creator's team, the owner and pending invitations included (docs/builder.md, phase 7).
  membersPerCreator: 10,
  projectsPerCreator: 10,
  pagesPerSite: 12,
  // The visual builder's grid (docs/builder.md): sections per page, elements per page, rows per section (24px each).
  sectionsPerPage: 30,
  elementsPerPage: 150,
  gridRows: 200,
  siteDocumentBytes: 400 * 1024,
  // A site's own stylesheet (js/site-css.js checks and rebuilds it).
  cssBytes: 50 * 1024,
  // Published versions kept per site, with restore (owner, 2026-10-15).
  versionsPerSite: 20,
  // Fonts creators upload (WOFF2 only).
  fontBytes: 2 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  imagesPerCreator: 200,
  renameHoldDays: 90,
  // Selling: products per creator, paid-file storage (separate from the image storage above), files per product.
  productsPerCreator: 25,
  filesPerProduct: 20,
  // One storage cap for everything a creator stores (owner, 2026-10-15): site images and fonts, paid files, Pac
  // previews and pieces they share; was 50 MB of images plus 500 MB of paid files. Extra storage will be paid by the
  // creator (not built). At the cap only new uploads stop; what is live stays live.
  storageQuotaBytes: 550 * 1024 * 1024,
  // Files in one version of a Pac built with the Pack Builder (docs/packs.md).
  filesPerPacVersion: 2000,
  // One file in a Pac: the largest size checked end to end (downloads, bundles, the engine's checks); the engine itself
  // reads up to 20 GB, but bigger files stay out until they've been tested (docs/packs.md).
  pacFileMaxBytes: 4 * 1024 ** 3
};

// Selling rules (docs/creators.md). Prices are whole cents: free, or between the card processor's practical minimum
// and a ceiling that keeps a typo from charging $5,000. Money from a sale can be paid out once it is HOLD_DAYS old
// (refund and chargeback window); a payout request must be at least MIN_PAYOUT_CENTS.
export const SELLING = {
  minPriceCents: 100,
  maxPriceCents: 50000,
  holdDays: 14,
  minPayoutCents: 1000,
  // Kinds of product a creator can make: the keys of data/product-types.js (a unit test keeps them equal).
  kinds: ["music", "stems", "samples", "sample-pack", "presets", "visuals", "vj-loops", "other"]
};

// The platform's share of a sale, in basis points (1/100 of a percent), when a creator has none of its own: 20%, the
// owner's choice (docs/decisions.md). Each order line keeps the split it was written with, so a change here only
// affects later sales. A creator's own platform_fee_bps (Control Center) overrides it.
export const DEFAULT_PLATFORM_FEE_BPS = 2000;

// A creator's paid-file quota: an admin-set one (creators.files_quota_bytes), else the free plan's.
// A creator's one storage quota: the smaller of any quota an admin set (creators.storage_quota_bytes, from the Control
// Center; files_quota_bytes, an older paid-file one set in the database), else the free plan's.
export const quotaOf = (creator) => {
  const set = creator ? [creator.storage_quota_bytes, creator.files_quota_bytes].filter((v) => v !== null && v !== undefined) : [];
  return set.length ? Math.min(...set) : LIMITS.storageQuotaBytes;
};
export const filesQuotaOf = quotaOf;
export const feeBpsOf = (creator) => (creator && creator.platform_fee_bps != null ? creator.platform_fee_bps : DEFAULT_PLATFORM_FEE_BPS);
