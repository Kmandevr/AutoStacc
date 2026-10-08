// Looks a creator can give their site without code: a preset (background, surface, text), an accent colour and a font
// from a short list. The result is a few CSS custom properties; css/creator-site.css does the rest. Nothing a creator
// types reaches the stylesheet except a validated #rrggbb colour and keys from these tables.
export const PRESETS = {
  midnight: { label: "Midnight", bg: "#0e0f13", surface: "#181a21", text: "#eceef3", muted: "#a2a7b5", scheme: "dark" },
  paper: { label: "Paper", bg: "#f7f5f0", surface: "#ffffff", text: "#1b1c20", muted: "#5d6270", scheme: "light" },
  terminal: { label: "Terminal", bg: "#050806", surface: "#0d1410", text: "#c8f7d0", muted: "#7fb38a", scheme: "dark" },
  dusk: { label: "Dusk", bg: "#1b1426", surface: "#261d35", text: "#f2ebff", muted: "#b9a9d6", scheme: "dark" },
  sand: { label: "Sand", bg: "#efe6d8", surface: "#fbf6ee", text: "#2b241b", muted: "#6e604e", scheme: "light" }
};

// Fonts served by Google Fonts (the CSP allows only fonts.googleapis.com and fonts.gstatic.com).
export const FONTS = {
  inter: { label: "Inter", family: "Inter", stack: "'Inter', system-ui, sans-serif", query: "Inter:wght@400;600;800" },
  grotesk: { label: "Space Grotesk", family: "Space Grotesk", stack: "'Space Grotesk', system-ui, sans-serif", query: "Space+Grotesk:wght@400;600;700" },
  serif: { label: "Playfair Display", family: "Playfair Display", stack: "'Playfair Display', Georgia, serif", query: "Playfair+Display:wght@400;700;900" },
  mono: { label: "JetBrains Mono", family: "JetBrains Mono", stack: "'JetBrains Mono', ui-monospace, monospace", query: "JetBrains+Mono:wght@400;600;700" },
  pixel: { label: "VT323", family: "VT323", stack: "'VT323', ui-monospace, monospace", query: "VT323" }
};

export const DEFAULT_THEME = { preset: "midnight", accent: "#a855f7", font: "inter" };
export const HEX = /^#[0-9a-f]{6}$/i;

export function themeCss(theme) {
  const p = PRESETS[theme.preset] || PRESETS[DEFAULT_THEME.preset];
  const f = FONTS[theme.font] || FONTS[DEFAULT_THEME.font];
  const accent = HEX.test(theme.accent || "") ? theme.accent.toLowerCase() : DEFAULT_THEME.accent;
  return `:root{color-scheme:${p.scheme};--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--accent:${accent};--font:${f.stack}}`;
}

export const fontHref = (theme) => `https://fonts.googleapis.com/css2?family=${(FONTS[theme.font] || FONTS[DEFAULT_THEME.font]).query}&display=swap`;
