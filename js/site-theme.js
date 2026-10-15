// Looks a creator can give a site without code (docs/builder.md): a preset (background, surface, text), an accent colour,
// a font from a short list or one they uploaded (WOFF2, checked by its bytes), and how the site's header shows. The
// result is a few CSS custom properties; css/creator-site.css does the rest. Nothing a creator types reaches this
// stylesheet except a validated #rrggbb colour, keys from these tables and the address of their own font. Shared by the
// server (server/sites/theme.js) and the Studio's visual editor; pure. Sets GS.siteTheme in browsers.
(function (root) {
  "use strict";

  const PRESETS = {
    midnight: { label: "Midnight", bg: "#0e0f13", surface: "#181a21", text: "#eceef3", muted: "#a2a7b5", scheme: "dark" },
    paper: { label: "Paper", bg: "#f7f5f0", surface: "#ffffff", text: "#1b1c20", muted: "#5d6270", scheme: "light" },
    terminal: { label: "Terminal", bg: "#050806", surface: "#0d1410", text: "#c8f7d0", muted: "#7fb38a", scheme: "dark" },
    dusk: { label: "Dusk", bg: "#1b1426", surface: "#261d35", text: "#f2ebff", muted: "#b9a9d6", scheme: "dark" },
    sand: { label: "Sand", bg: "#efe6d8", surface: "#fbf6ee", text: "#2b241b", muted: "#6e604e", scheme: "light" },
    neon: { label: "Neon", bg: "#07060d", surface: "#14112a", text: "#f5f3ff", muted: "#a5a0c8", scheme: "dark" },
    concrete: { label: "Concrete", bg: "#e7e7e4", surface: "#f4f4f2", text: "#161616", muted: "#5b5b58", scheme: "light" },
    ocean: { label: "Ocean", bg: "#06141c", surface: "#0d2230", text: "#e4f4fb", muted: "#8fb3c4", scheme: "dark" }
  };

  // Fonts served by Google Fonts (the CSP allows only fonts.googleapis.com and fonts.gstatic.com, plus the creator's own
  // uploaded fonts from /media/sites/).
  const FONTS = {
    inter: { label: "Inter", stack: "'Inter', system-ui, sans-serif", query: "Inter:wght@400;600;800" },
    grotesk: { label: "Space Grotesk", stack: "'Space Grotesk', system-ui, sans-serif", query: "Space+Grotesk:wght@400;600;700" },
    serif: { label: "Playfair Display", stack: "'Playfair Display', Georgia, serif", query: "Playfair+Display:wght@400;700;900" },
    mono: { label: "JetBrains Mono", stack: "'JetBrains Mono', ui-monospace, monospace", query: "JetBrains+Mono:wght@400;600;700" },
    pixel: { label: "VT323", stack: "'VT323', ui-monospace, monospace", query: "VT323" },
    display: { label: "Bebas Neue", stack: "'Bebas Neue', Impact, sans-serif", query: "Bebas+Neue" },
    rounded: { label: "Nunito", stack: "'Nunito', system-ui, sans-serif", query: "Nunito:wght@400;700;900" },
    syne: { label: "Syne", stack: "'Syne', system-ui, sans-serif", query: "Syne:wght@400;600;800" }
  };

  // How the site's own header shows: name or logo with the menu, the menu alone, or nothing (the creator builds it).
  const HEADERS = { bar: "Name and menu", menu: "Menu only", none: "Hidden" };

  const DEFAULT_THEME = { preset: "midnight", accent: "#a855f7", font: "inter", fontAsset: "", logo: "", header: "bar", css: "" };
  const HEX = /^#[0-9a-f]{6}$/i;

  // fontSrc: the address of the creator's uploaded font when theme.fontAsset is theirs (else null).
  function themeCss(theme, fontSrc) {
    const p = PRESETS[theme.preset] || PRESETS[DEFAULT_THEME.preset];
    const f = FONTS[theme.font] || FONTS[DEFAULT_THEME.font];
    const accent = HEX.test(theme.accent || "") ? theme.accent.toLowerCase() : DEFAULT_THEME.accent;
    const own = fontSrc && /^\/media\/sites\/as_[a-z2-7]{20,40}$/.test(fontSrc);
    const face = own ? `@font-face{font-family:"cs-own";src:url("${fontSrc}") format("woff2");font-display:swap}` : "";
    return `${face}:root{color-scheme:${p.scheme};--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--accent:${accent};--font:${own ? `"cs-own", ` : ""}${f.stack}}`;
  }

  const fontHref = (theme) => `https://fonts.googleapis.com/css2?family=${(FONTS[theme.font] || FONTS[DEFAULT_THEME.font]).query}&display=swap`;

  const api = { PRESETS, FONTS, HEADERS, DEFAULT_THEME, HEX, themeCss, fontHref };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).siteTheme = api;
})(typeof self !== "undefined" ? self : globalThis);
