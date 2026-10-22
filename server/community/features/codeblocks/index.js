// Code and settings blocks in posts (owner, 2026-10-20): text between two lines of three backticks is kept exactly as
// typed (spaces, line breaks, symbols), in a monospace block with a copy-friendly <pre>, and nothing inside is read as
// formatting or turned into a link. An optional word after the opening fence names the language (shown, not run).
// Its own switch (community.codeblocks): off, the fences are ordinary text.
import { esc } from "../../core/render-parts.js";

const FENCE = /^```[ \t]*([A-Za-z0-9+#._-]{0,20})[ \t]*$/;
const MAX_CODE = 6000;

// Splits text into formatted text parts and code blocks: a fence that never closes stays ordinary text.
function blocks(text) {
  const lines = text.split("\n");
  const parts = [];
  let plain = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);
    let close = -1;
    if (open) for (let j = i + 1; j < lines.length; j++) if (/^```[ \t]*$/.test(lines[j])) { close = j; break; }
    if (close < 0) { plain.push(lines[i]); continue; }
    if (plain.length) parts.push({ text: plain.join("\n") });
    plain = [];
    const code = lines.slice(i + 1, close).join("\n").slice(0, MAX_CODE);
    const lang = open[1] ? `<span class="cm-code-lang">${esc(open[1])}</span>` : "";
    parts.push({ html: `<figure class="cm-code">${lang}<pre><code>${esc(code)}</code></pre></figure>` });
    i = close;
  }
  if (plain.length) parts.push({ text: plain.join("\n") });
  return parts;
}

export default { name: "codeblocks", switch: "community.codeblocks", format: { blocks: [blocks] } };
