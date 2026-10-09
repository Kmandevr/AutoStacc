// Store search parameters: reads the address's query (/api/store/search?...) into one filter object, checking every
// value. Malformed input is a 400; a well-formed value the vocabulary doesn't know (an old bookmark) is dropped and
// reported in `ignored`, so a shared link still opens. Pure: no database.
import { fail } from "../lib/http.js";
import { FACETS, canonical } from "./vocabulary.js";

export const SORTS = ["relevance", "bestselling", "newest", "price-asc", "price-desc", "discount", "name"];
export const PAGE = { per: 24, maxPer: 48, maxPage: 200 };
export const NEW_DAYS = 30;
const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_MAX = 20;

const list = (raw, name) => {
  if (raw === null || raw === "") return [];
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (items.length > LIST_MAX) fail(400, "invalid_filter", `Up to ${LIST_MAX} values for ${name}.`, { field: name });
  return [...new Set(items)];
};
const money = (raw, name) => {
  if (raw === null || raw === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(raw)) fail(400, "invalid_filter", `${name} is an amount like 9.99.`, { field: name });
  return Math.round(Number(raw) * 100);
};
const whole = (raw, name, min, max) => {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, "invalid_filter", `${name} is a whole number from ${min} to ${max}.`, { field: name });
  return n;
};
const flag = (raw, name) => {
  if (raw === null || raw === "") return null;
  if (raw !== "0" && raw !== "1") fail(400, "invalid_filter", `${name} is 0 or 1.`, { field: name });
  return raw === "1";
};

// kinds: the keys of data/product-types.js (server/creators/policy.js SELLING.kinds), the store's categories.
export function parseFilters(params, kinds) {
  const ignored = [];
  const q = (params.get("q") || "").trim().replace(/\s+/g, " ");
  if (q.length > 100) fail(400, "invalid_filter", "Search is up to 100 characters.", { field: "q" });
  const words = q.toLowerCase().split(" ").filter(Boolean).slice(0, 6);

  const categories = list(params.get("category"), "category").filter((c) => (kinds.includes(c) ? true : (ignored.push(`category:${c}`), false)));
  const facets = {};
  for (const facet of Object.keys(FACETS)) {
    const values = [];
    for (const raw of list(params.get(facet), facet)) {
      if (!WORD.test(raw)) fail(400, "invalid_filter", `${facet} values are lowercase words.`, { field: facet });
      const c = canonical(facet, raw);
      if (c) values.includes(c) || values.push(c); else ignored.push(`${facet}:${raw}`);
    }
    if (values.length) facets[facet] = values;
  }
  const creators = list(params.get("creator"), "creator");
  if (creators.some((c) => !/^[A-Za-z0-9_-]{1,80}$/.test(c))) fail(400, "invalid_filter", "creator is a list of project ids.", { field: "creator" });

  const priceMin = money(params.get("price_min"), "price_min");
  const priceMax = money(params.get("price_max"), "price_max");
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) fail(400, "invalid_filter", "The lowest price is above the highest.", { field: "price_min" });
  const bpmMin = whole(params.get("bpm_min"), "bpm_min", 1, 400);
  const bpmMax = whole(params.get("bpm_max"), "bpm_max", 1, 400);
  if (bpmMin !== null && bpmMax !== null && bpmMin > bpmMax) fail(400, "invalid_filter", "The lowest BPM is above the highest.", { field: "bpm_min" });

  const sort = params.get("sort") || "relevance";
  if (!SORTS.includes(sort)) fail(400, "invalid_filter", `sort is one of ${SORTS.join(", ")}.`, { field: "sort" });
  const page = whole(params.get("page"), "page", 1, PAGE.maxPage) || 1;
  const per = whole(params.get("per"), "per", 1, PAGE.maxPer) || PAGE.per;

  return {
    q, words, categories, facets, creators, priceMin, priceMax, bpmMin, bpmMax,
    free: flag(params.get("free"), "free"), sale: flag(params.get("sale"), "sale"), recent: flag(params.get("new"), "new"),
    sort, page, per, ignored
  };
}

// Anything the person narrowed by (a query, a filter): personal ranking then never reorders their results.
export const isNarrowed = (f) => Boolean(f.words.length || f.categories.length || Object.keys(f.facets).length || f.creators.length
  || f.priceMin !== null || f.priceMax !== null || f.bpmMin !== null || f.bpmMax !== null || f.free !== null || f.sale || f.recent);
