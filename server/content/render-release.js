// A release's page (/<creator>/<project>/music/<slug>), the same for every creator, first-party included: title
// "<title> (<type>) · <project> · AutoStacc", canonical (trusted creators only, else noindex), Open Graph music.album
// and JSON-LD (WebPage + BreadcrumbList, MusicAlbum with its tracks). Embeds come only from server/sites/embeds.js.
import { esc } from "../sites/text.js";
import { EMBED_HOSTS, embedFor } from "../sites/embeds.js";
import { SITE_NAME, abs, webPage, shell, hero, picture, ogImage, local, clip, fmtDate, crumbsFor, byline, artistRef, tagList } from "./page.js";

const RELEASE_TYPES = { Single: "SingleRelease", EP: "EPRelease", Album: "AlbumRelease" };
const DURATION = /^(\d{1,3}):([0-5]\d)$/;
const isoDuration = (d) => {
  const m = DURATION.exec(String(d || ""));
  return m ? `PT${Number(m[1])}M${Number(m[2])}S` : null;
};
const isHttps = (u) => typeof u === "string" && /^https:\/\/[^/\s]+\.[^/\s]+/.test(u);

// A player for a share link, or for a player address embeds.js already made (content.js hands those out); never a
// frame from anywhere else (the CSP allows only EMBED_HOSTS).
function frameOf(raw) {
  const made = embedFor(raw);
  if (made) return made;
  let u;
  try { u = new URL(String(raw || "")); } catch { return null; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && EMBED_HOSTS.includes(u.origin)
    ? { src: u.href, ratio: /youtube/.test(u.hostname) ? "16 / 9" : null } : null;
}

// The embedded player: the release's main link, else its backup, only through the known players.
function player(r, artist) {
  const e = frameOf(r.embedUrl) || frameOf(r.fallbackEmbedUrl);
  if (!e) return `<div class="player-empty"><span>&gt; awaiting signal</span><span class="cursor">no player yet</span></div>`;
  return `<div class="listen-player"><iframe class="player${e.ratio ? " tall" : ""}" src="${esc(e.src)}" title="${esc(`${r.title} by ${artist}`)}" loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`;
}

// r: { id (the slug), title, type, date, upc, description, artwork, tracks, credits, embedUrl, fallbackEmbedUrl, links, tags }
export function renderRelease(siteUrl, ctx, r) {
  const path = `${ctx.home}/music/${r.id}`;
  const url = abs(siteUrl, path);
  const type = RELEASE_TYPES[r.type] ? r.type : "Album";
  const crumbs = crumbsFor(ctx, "music", [r.title, path]);
  const title = `${r.title} (${type.toLowerCase()}) · ${ctx.project.name} · ${SITE_NAME}`;
  const description = clip(r.description || `${r.title}, a ${type.toLowerCase()} by ${ctx.project.name}, released ${fmtDate(r.date)}.`);
  const links = (r.links || []).filter((l) => l && l.name && isHttps(l.url));
  const tracks = (r.tracks || []).filter((t) => t && t.title);
  const credits = (r.credits || []).filter((c) => c && c.role && c.name);
  const total = tracks.reduce((t, x) => { const m = DURATION.exec(String(x.duration || "")); return t + (m ? Number(m[1]) * 60 + Number(m[2]) : 0); }, 0);
  const length = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  const artist = artistRef(siteUrl, ctx);
  const image = ogImage(r.artwork);
  const tags = r.tags || [];
  const page = {
    path, title, description,
    index: ctx.index,
    ogType: "music.album",
    image,
    og: { "music:musician": abs(siteUrl, ctx.home), "music:release_date": r.date },
    schema: [
      webPage(siteUrl, { path, title, description }, url + "#release", crumbs),
      {
        "@type": "MusicAlbum",
        "@id": url + "#release",
        name: r.title,
        url,
        description,
        albumReleaseType: "https://schema.org/" + RELEASE_TYPES[type],
        byArtist: artist,
        datePublished: r.date,
        ...(image && { image: abs(siteUrl, image.src) }),
        ...(tags.length && { keywords: tags.join(", ") }),
        numTracks: tracks.length,
        track: {
          "@type": "ItemList",
          numberOfItems: tracks.length,
          itemListElement: tracks.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: { "@type": "MusicRecording", name: t.title, byArtist: artist, ...(isoDuration(t.duration) && { duration: isoDuration(t.duration) }), ...(t.isrc && { isrcCode: t.isrc }) }
          }))
        },
        ...(links.length && { sameAs: links.map((l) => l.url) })
      }
    ]
  };
  const main = `${hero(crumbs, `${esc(type)} · ${esc(String(r.date).slice(0, 4))}`, r.title, byline(ctx))}

    <section>
      <div class="wrap release">
        ${r.artwork && local(r.artwork.src) ? `<figure class="release-art">${picture(r.artwork, "(max-width: 860px) 100vw, 480px", true)}</figure>` : ""}
        <div class="release-info">
          <p class="lede">${esc(r.description || description)}</p>
          <dl class="facts">
            <dt>Artist</dt><dd><a href="${esc(ctx.home)}">${esc(ctx.project.name)}</a></dd>
            <dt>Release</dt><dd>${esc(type)}</dd>
            <dt>Released</dt><dd><time datetime="${esc(r.date)}">${fmtDate(r.date)}</time></dd>
            <dt>Length</dt><dd>${tracks.length} track${tracks.length === 1 ? "" : "s"}, ${length}</dd>
            ${r.upc ? `<dt>UPC</dt><dd>${esc(r.upc)}</dd>` : ""}
          </dl>
          ${tagList(tags)}
          ${links.length ? `<p class="platforms-label">Stream ${esc(r.title)} on</p>
          <div class="platforms">${links.map((l) => `<a class="btn ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join("")}</div>` : ""}
        </div>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <div class="section-head"><h2>Listen</h2></div>
        ${player(r, ctx.project.name)}
      </div>
    </section>

    <section>
      <div class="wrap">
        <div class="section-head"><h2>Tracklist</h2></div>
        <ol class="tracklist">
          ${tracks.map((t) => `<li><span class="track-title">${esc(t.title)}</span>${isoDuration(t.duration) ? `<time datetime="${isoDuration(t.duration)}">${esc(t.duration)}</time>` : ""}${t.isrc ? `<span class="isrc">ISRC ${esc(t.isrc)}</span>` : ""}</li>`).join("\n          ")}
        </ol>
        ${credits.length ? `<h2 class="sub-head">Credits</h2>
        <dl class="facts">${credits.map((c) => `<dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd>`).join("")}</dl>` : ""}
      </div>
    </section>

    <section class="alt">
      <div class="wrap detail-more">
        ${ctx.lists.music ? `<a class="btn ghost" href="${esc(ctx.home)}/music">All music</a>` : `<a class="btn ghost" href="${esc(ctx.home)}">${esc(ctx.project.name)}</a>`}
        <a class="btn ghost" href="/shop">Shop downloads</a>
      </div>
    </section>`;
  return shell(siteUrl, ctx, { page, section: "music", styles: ["music", "detail"], main });
}
