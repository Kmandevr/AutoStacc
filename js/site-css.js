// Creators' own CSS for their sites (docs/builder.md, "How it stays safe"): read into rules and declarations and written
// out again, never passed through. Every selector is put under the page area (.cs-site), so the AutoStacc strip, the
// footer, body, html and :root can't be reached; the page area is contain: paint and isolation: isolate
// (css/creator-site.css), so even position: fixed stays inside it. Refused: other at-rules than @media, @supports,
// @container and @keyframes; url() other than the creator's own files (/media/sites/<id>); image-set(), expression(),
// behavior, -moz-binding; backslash escapes and "<" anywhere; nesting (&). check(css) returns { css, assets, problems }:
// css is the rebuilt sheet ("" when there are problems), assets the ids its url()s name (the server checks they are the
// creator's own), problems plain-language messages. Shared by the server (server/sites/css.js) and the Studio's editor;
// pure. Sets GS.siteCss in browsers.
(function (root) {
  "use strict";

  const MAX_BYTES = 50 * 1024;
  const MAX_RULES = 2000;
  const SCOPE = ".cs-site";
  const AT = new Set(["media", "supports", "container", "keyframes", "-webkit-keyframes"]);
  const BAD_PROPS = new Set(["behavior", "-moz-binding", "-ms-behavior"]);
  const BAD_VALUE = /expression\s*\(|javascript:|vbscript:|image-set\s*\(|-webkit-image-set\s*\(|src\s*\(|@/i;
  const URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;
  const OWN_FILE = /^\/media\/sites\/(as_[a-z2-7]{20,40})$/;
  const SELECTOR_CHARS = /^[a-zA-Z0-9_\-\s.#:>+~*()[\]="'^$|,%]+$/;
  // Type selectors and pseudo-classes outside the page area: refused rather than silently matching nothing.
  const OUTSIDE = /(^|[\s>+~(,])(html|body|head)(?![\w-])|:root|:host|::slotted|::part|:scope/i;
  const PRELUDE_CHARS = /^[a-zA-Z0-9\s().:,%\-<>=/]*$/;
  const CLASS = /^[a-z][a-z0-9_-]{0,30}$/;

  // Comments out, then statements: { at, prelude, block } or { selector, block } or { at, prelude } (no block).
  function parse(src, problems) {
    let s = "";
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) { problems.push("A comment is never closed (*/)."); return []; }
        i = end + 1;
        s += " ";
      } else s += src[i];
    }
    let i = 0;
    function block() {
      // From just after "{" to its matching "}", skipping strings.
      const start = i;
      let depth = 1;
      while (i < s.length) {
        const c = s[i];
        if (c === '"' || c === "'") { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === "\n") break; i++; } }
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) { i++; return s.slice(start, i - 1); }
        i++;
      }
      problems.push("A { is never closed.");
      return null;
    }
    const out = [];
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      let head = "";
      while (i < s.length && s[i] !== "{" && s[i] !== ";" && s[i] !== "}") {
        if (s[i] === '"' || s[i] === "'") { const q = s[i]; head += s[i++]; while (i < s.length && s[i] !== q) head += s[i++]; }
        head += s[i++] || "";
      }
      if (s[i] === "}") { problems.push("There is a } with no { before it."); i++; continue; }
      const end = s[i];
      i++;
      head = head.trim();
      if (end === ";") { const m = head.match(/^@([-a-z]+)/i); out.push(m ? { at: m[1].toLowerCase(), prelude: "" } : { selector: head, block: "" }); continue; }
      const body = block();
      if (body === null) return out;
      if (head.startsWith("@")) {
        const m = head.match(/^@([-a-z]+)\s*([\s\S]*)$/i);
        out.push({ at: m ? m[1].toLowerCase() : head, prelude: m ? m[2].trim() : "", block: body });
      } else out.push({ selector: head, block: body });
    }
    return out;
  }

  // Split on a separator outside strings, parentheses and brackets.
  function split(text, sep) {
    const parts = [];
    let depth = 0, cur = "", q = null;
    for (const c of text) {
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (c === sep && depth === 0) { parts.push(cur); cur = ""; } else cur += c;
    }
    parts.push(cur);
    return parts;
  }

  function declarations(text, where, problems, assets) {
    const out = [];
    for (const raw of split(text, ";")) {
      const d = raw.trim();
      if (!d) continue;
      const at = d.indexOf(":");
      if (at < 1) { problems.push(`${where}: "${d.slice(0, 40)}" isn't a property: value pair.`); continue; }
      const prop = d.slice(0, at).trim().toLowerCase();
      let value = d.slice(at + 1).trim();
      if (!/^(--[a-z0-9_-]{1,60}|-?[a-z][a-z0-9-]{0,60})$/.test(prop)) { problems.push(`${where}: "${prop}" isn't a property name.`); continue; }
      if (BAD_PROPS.has(prop)) { problems.push(`${where}: ${prop} isn't allowed.`); continue; }
      if (!value || value.length > 2000) { problems.push(`${where}: ${prop} needs a value (under 2000 characters).`); continue; }
      if (/[{}]/.test(value.replace(/(["'])(?:(?!\1).)*\1/g, ""))) { problems.push(`${where}: ${prop} has a stray brace.`); continue; }
      if (BAD_VALUE.test(value)) { problems.push(`${where}: ${prop} uses something that isn't allowed (expression, image-set, src or @).`); continue; }
      let bad = false;
      value = value.replace(URL, (m, quote, address) => {
        const own = address.trim().match(OWN_FILE);
        if (!own) { bad = true; return m; }
        assets.add(own[1]);
        return `url("/media/sites/${own[1]}")`;
      });
      if (bad) { problems.push(`${where}: url() may only use your own uploads (copy an image's address from your images).`); continue; }
      if (/url\s*\(/i.test(value.replace(/url\("\/media\/sites\/as_[a-z2-7]+"\)/g, ""))) { problems.push(`${where}: that url() can't be read.`); continue; }
      out.push(`${prop}:${value}`);
    }
    return out.join(";");
  }

  // The first combinator at the top level of a selector (" ", ">", "+" or "~"), or "" when it has none.
  function firstCombinator(sel) {
    const s = sel.replace(/\s*([>+~])\s*/g, "$1");
    let depth = 0, q = null;
    for (const c of s) {
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && " >+~".includes(c)) return c;
    }
    return "";
  }

  function selectors(text, where, problems) {
    const out = [];
    for (const raw of split(text, ",")) {
      const sel = raw.trim().replace(/\s+/g, " ");
      if (!sel) { problems.push(`${where}: an empty selector.`); return null; }
      if (sel.length > 300 || !SELECTOR_CHARS.test(sel)) { problems.push(`${where}: "${sel.slice(0, 60)}" uses characters selectors can't have here (no &, @, \\ or /).`); return null; }
      if (OUTSIDE.test(sel)) { problems.push(`${where}: "${sel.slice(0, 60)}" reaches outside your page (html, body, :root and the like aren't allowed; style .cs-site for the whole page).`); return null; }
      // Leading combinators, or a sibling of the page area itself, would step outside it.
      if (/^[>+~]/.test(sel) || (sel.startsWith(SCOPE) && firstCombinator(sel) && "+~".includes(firstCombinator(sel)))) { problems.push(`${where}: "${sel.slice(0, 60)}" reaches outside your page.`); return null; }
      out.push(sel === SCOPE || sel.startsWith(SCOPE + ":") || sel.startsWith(SCOPE + ".") ? sel : sel.startsWith(SCOPE + " ") ? sel : `${SCOPE} ${sel}`);
    }
    return out.join(",");
  }

  function rules(list, problems, assets, depth, count) {
    const out = [];
    for (const r of list) {
      if (++count.n > MAX_RULES) { problems.push(`At most ${MAX_RULES} rules.`); break; }
      if (r.at !== undefined) {
        const where = `@${r.at}`;
        if (!AT.has(r.at) || r.block === undefined) { problems.push(`${where} isn't allowed${r.at === "import" ? ": upload fonts and images instead of importing them" : ""}.`); continue; }
        if (depth > 2) { problems.push(`${where}: too deeply nested.`); continue; }
        if (r.at.endsWith("keyframes")) {
          if (!/^[a-z][a-z0-9_-]{0,40}$/i.test(r.prelude) || /^cs-/i.test(r.prelude)) { problems.push(`${where}: give it a simple name (not starting with cs-).`); continue; }
          const frames = [];
          for (const f of parse(r.block, problems)) {
            const sel = (f.selector || "").trim().toLowerCase();
            if (!/^(from|to|\d{1,3}(\.\d+)?%)(\s*,\s*(from|to|\d{1,3}(\.\d+)?%))*$/.test(sel)) { problems.push(`${where} ${r.prelude}: "${sel}" isn't a keyframe.`); continue; }
            frames.push(`${sel.replace(/\s+/g, "")}{${declarations(f.block, `${where} ${r.prelude}`, problems, assets)}}`);
          }
          out.push(`@keyframes ${r.prelude}{${frames.join("")}}`);
          continue;
        }
        if (!r.prelude || r.prelude.length > 300 || !PRELUDE_CHARS.test(r.prelude)) { problems.push(`${where}: "${r.prelude.slice(0, 60)}" can't be read.`); continue; }
        out.push(`@${r.at} ${r.prelude.replace(/\s+/g, " ")}{${rules(parse(r.block, problems), problems, assets, depth + 1, count)}}`);
        continue;
      }
      const sel = selectors(r.selector, `"${r.selector.slice(0, 40)}"`, problems);
      if (sel === null) continue;
      if (/(^|[^"'])&/.test(r.block) || /{/.test(r.block.replace(/(["'])(?:(?!\1).)*\1/g, ""))) { problems.push(`"${r.selector.slice(0, 40)}": nested rules aren't allowed; write each rule on its own.`); continue; }
      out.push(`${sel}{${declarations(r.block, `"${r.selector.slice(0, 40)}"`, problems, assets)}}`);
    }
    return out.join("");
  }

  function check(src) {
    const problems = [];
    const assets = new Set();
    const text = String(src || "");
    if (!text.trim()) return { css: "", assets, problems };
    if (new TextEncoder().encode(text).length > MAX_BYTES) return { css: "", assets, problems: [`Your CSS is over ${MAX_BYTES / 1024} KB.`] };
    if (text.includes("<")) problems.push("CSS can't contain <.");
    if (text.includes("\\")) problems.push("CSS can't contain backslash escapes (\\).");
    if (problems.length) return { css: "", assets, problems };
    const css = rules(parse(text, problems), problems, assets, 0, { n: 0 });
    return problems.length ? { css: "", assets, problems: problems.slice(0, 20) } : { css, assets, problems };
  }

  // Class names creators give elements and sections: lowercase, and never AutoStacc's own (cs-...).
  const cleanClasses = (v) => (Array.isArray(v) ? v : String(v || "").split(/\s+/)).map((c) => String(c).trim()).filter((c) => CLASS.test(c) && !c.startsWith("cs-")).slice(0, 4);

  const api = { check, cleanClasses, MAX_BYTES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).siteCss = api;
})(typeof self !== "undefined" ? self : globalThis);
