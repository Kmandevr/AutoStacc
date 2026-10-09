// Stripe product tax codes. The live account sells through Managed Payments, which refuses a Checkout line without an
// eligible digital-goods code and works out the tax from it. One code per kind of product (the keys of
// data/product-types.js; a unit test keeps them equal). Eligible codes: docs.stripe.com/payments/managed-payments/eligibility.
// These are the closest descriptions, not tax advice: the owner confirms them with their tax adviser, and a change here
// changes only Checkout sessions created afterwards.
export const TAX_CODES = {
  music: "txcd_10401100",          // Digital Audio Works, downloaded, permanent rights
  stems: "txcd_10401100",
  samples: "txcd_10401100",
  "sample-pack": "txcd_10401100",
  presets: "txcd_10000000",        // General, electronically supplied (preset files fit no narrower code)
  visuals: "txcd_10505001",        // Digital Finished Artwork, downloaded, permanent rights
  "vj-loops": "txcd_10402100",     // Digital Audio Visual Works, downloaded, permanent rights
  other: "txcd_10000000"
};
export const GENERAL_TAX_CODE = "txcd_10000000";
export const taxCodeFor = (type) => TAX_CODES[type] || GENERAL_TAX_CODE;
