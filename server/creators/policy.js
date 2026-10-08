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
  renameHoldDays: 90
};

// The platform's share of a sale, in basis points (1/100 of a percent), when a creator has none of its own. Zero until
// the owner decides the pricing (docs/creators.md); changing it here changes only orders written afterwards.
export const DEFAULT_PLATFORM_FEE_BPS = 0;

export const quotaOf = (creator) => (creator && creator.storage_quota_bytes != null ? creator.storage_quota_bytes : LIMITS.storageQuotaBytes);
export const feeBpsOf = (creator) => (creator && creator.platform_fee_bps != null ? creator.platform_fee_bps : DEFAULT_PLATFORM_FEE_BPS);
