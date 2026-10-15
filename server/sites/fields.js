// Field checks shared by the site document's parts (sites/document.js, sites/elements.js): each refuses with a 400 that
// names the place in the document ("pages[0].sections[1].elements[2].text: at most 120 characters").
import { fail } from "../lib/http.js";
import { safeUrl } from "./text.js";

export const bad = (where, what) => fail(400, "invalid_site", `${where}: ${what}`, { where });

export const text = (v, where, max, { required = false } = {}) => {
  if (v === undefined || v === null || v === "") {
    if (required) bad(where, "required");
    return "";
  }
  if (typeof v !== "string") bad(where, "must be text");
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > max) bad(where, `at most ${max} characters`);
  return s;
};

export const url = (v, where, { required = true } = {}) => {
  if (!v && !required) return "";
  const u = safeUrl(v);
  if (!u) bad(where, "use a full https:// link, a mailto: address or an AutoStacc address starting with /");
  return u;
};

export const list = (v, where, max) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) bad(where, "must be a list");
  if (v.length > max) bad(where, `at most ${max} items`);
  return v;
};
