// Renders the "Listen" section on the home page: an embedded player and streaming links. Needs data/music.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet } = window.GS;
  const MUSIC = window.MUSIC || {};

  const player = $("#listen-player");
  const platforms = $("#listen-platforms");
  if (!player || !platforms) return;

  // Only well-known players are embedded, so a typo can't load an unrelated page into the site.
  const PLAYERS = ["open.spotify.com", "w.soundcloud.com", "widget.deezer.com", "bandcamp.com", "embed.music.apple.com",
    "www.youtube.com", "www.youtube-nocookie.com"];
  let src = "";
  let host = "";
  try {
    const u = new URL(MUSIC.embedUrl);
    // A normal Spotify share link (open.spotify.com/album/...) only plays when framed as /embed/album/...
    if (u.hostname === "open.spotify.com" && !u.pathname.startsWith("/embed/")) u.pathname = "/embed" + u.pathname;
    if (u.protocol === "https:") [src, host] = [u.href, u.hostname];
  } catch { /* not set */ }

  if (PLAYERS.some((h) => host === h || host.endsWith("." + h))) {
    // Spotify's, SoundCloud's and Deezer's players are short; the others need a 16:9 frame.
    const tall = !/spotify|soundcloud|deezer/.test(host);
    player.innerHTML = `<iframe class="player${tall ? " tall" : ""}" src="${escapeHTML(src)}"
      title="${escapeHTML(MUSIC.embedTitle || "Music player")}" loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  } else {
    player.innerHTML = `<div class="player-empty"><span>&gt; awaiting signal</span><span class="cursor">first release incoming</span></div>`;
  }

  const live = (MUSIC.platforms || []).filter((p) => isSet(p.url));
  platforms.innerHTML = live.length
    ? live.map((p) => `<a class="btn ghost" href="${escapeHTML(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.name)}</a>`).join("")
    : `<p class="empty">Streaming links land here with the first release. <a href="#newsletter">Get told first</a>.</p>`;
})();
