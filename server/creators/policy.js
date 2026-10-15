// The free plan's limits, in one place: what any creator gets without paying. They keep storage and abuse bounded;
// they are not prices. A creator's own quota or platform fee (D1 `creators`, set by an admin) overrides the default.
// Paid plans, when they exist, will be rows that raise these, not new code paths.
export const LIMITS = {
  creatorsPerAccount: 1,
  projectsPerCreator: 10,
  pagesPerSite: 12,
  blocksPerPage: 60,
  siteDocumentBytes: 200 * 1024,
  imageBytes: 5 * 1024 * 1024,
  imagesPerCreator: 200,
  storageQuotaBytes: 50 * 1024 * 1024,
  renameHoldDays: 90,
  // Selling: products per creator, paid-file storage (separate from the image storage above), files per product.
  productsPerCreator: 25,
  filesPerProduct: 20,
  // Paid files (originals for sale), free plan; extra storage will be paid by the creator (owner, 2026-10-10; not built).
  productFilesQuotaBytes: 500 * 1024 * 1024,
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
export const filesQuotaOf = (creator) => (creator && creator.files_quota_bytes != null ? creator.files_quota_bytes : LIMITS.productFilesQuotaBytes);
export const quotaOf = (creator) => (creator && creator.storage_quota_bytes != null ? creator.storage_quota_bytes : LIMITS.storageQuotaBytes);
export const feeBpsOf = (creator) => (creator && creator.platform_fee_bps != null ? creator.platform_fee_bps : DEFAULT_PLATFORM_FEE_BPS);
