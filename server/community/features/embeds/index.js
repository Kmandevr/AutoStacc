// Music embeds in posts (owner, 2026-10-20; docs/community.md, "Features"): a SoundCloud, YouTube, Spotify or Apple
// Music share link becomes that service's own player. The frame address is rebuilt from the parsed link by the same
// module creator pages use (js/site-embeds.js), never copied from the post, and the page's policy allows frames from
// those four hosts only (core/page.js). Its own switch (community.embeds): off, the links stay plain links.
import { embedFor } from "../../../sites/embeds.js";
import { esc } from "../../core/render-parts.js";

// A link whose whole text is the address (a bare link, or a label that is the address) shows the player; a labelled
// link keeps the label and the player together, so the label is never lost.
function link(u, labelHtml) {
  const e = embedFor(u.href);
  if (!e) return null;
  const frame = `<span class="cm-embed cm-embed-${esc(e.provider)}"><iframe src="${esc(e.src)}" title="${esc(e.title)} player" height="${e.height}"${e.ratio ? ` style="aspect-ratio:${e.ratio};height:auto"` : ""} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe></span>`;
  // The address shows beside the label like any other link, so a label can't pose as another site.
  return `<a href="${esc(u.href)}" rel="ugc nofollow noopener"><bdi>${labelHtml}</bdi></a> <span class="link-host">(${esc(u.hostname.replace(/^www\./, ""))})</span>${frame}`;
}

export default { name: "embeds", switch: "community.embeds", format: { links: [link] } };
