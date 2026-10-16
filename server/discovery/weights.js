// Recommendation weights and policy, in one place (docs/discovery.md explains each). The score of an eligible product
// is the weighted mean of components that are each normalized to 0..1, so no raw count, price or percentage is ever
// added to another. Change a number here and the tests in test/unit/discovery-rank.test.js say what moved.

export const WEIGHTS = {
  preference: 0.30, // how well its genre, style, mood, use and kind match what the person chose and engaged with
  search: 0.20,     // how well it matches the words of the current (or recent) search
  behavior: 0.18,   // how close it is to products the person saved, carted, previewed or opened
  price: 0.07,      // closeness to the prices the person explores (only a fit; a stated budget is a hard limit)
  quality: 0.05,    // trust: a verified creator, and buyers' reviews as a confidence-adjusted average (RATING)
  popularity: 0.08, // confirmed purchases, saves and views, on a log scale and capped by this small weight
  freshness: 0.05,  // released or added in the last FRESH_DAYS
  discovery: 0.07   // room for the unfamiliar: outside the person's usual kinds and genres, or rarely seen yet
};

// How much each kind of interaction says about interest (0..1); a single view says little, a save a lot. A purchase
// counts toward taste but its product is never recommended again, and buying one thing doesn't ask for copies of it.
export const EVIDENCE = { wishlist: 1, preference: 1, cart: 0.7, preview: 0.5, owned: 0.4, click: 0.25, view: 0.15, filter: 0.3, dismissed: -0.6 };

// Facets that describe taste, and how much each counts inside the preference component.
export const TASTE_FACETS = { genre: 1, style: 0.8, mood: 0.6, use: 0.6, energy: 0.3, contents: 0.5, instrument: 0.4, category: 0.7 };

export const POLICY = {
  neutral: 0.3,          // a facet the person cares about but the product doesn't state: neither a match nor a miss
  freshDays: 60,
  perCreator: 2,         // at most this many products from one creator (project) in a section
  creatorDecay: 0.6,     // each further pick from the same creator is worth this much less while diversifying
  genreDecay: 0.85,      // ...and from the same primary genre
  repeatPenalty: 0.12,   // per time a product was shown and passed over (impressions without a click), up to:
  repeatPenaltyMax: 0.5,
  seenFactor: 0.75,      // a product the person already opened, carted or saved, against ones they haven't seen
  sectionSize: 6,
  minSection: 2,
  candidates: 400,       // eligible products scored per request, the most-sold and newest first
  bestsellerMin: 3       // confirmed purchases (90 days) before a product may sit in "Bestselling"
};

// Buyers' reviews (server/reviews/) as a Bayesian average: a product's mean stars pulled toward `prior` as if it had
// `weight` more reviews of that score, so one 5-star review doesn't outrank twenty 4.6s and new products aren't
// penalised for having none (they sit at the prior).
export const RATING = { prior: 3.5, weight: 5 };
export const ratingScore = (count, average) => (RATING.prior * RATING.weight + (count || 0) * (average || 0)) / (RATING.weight + (count || 0));
