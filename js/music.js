// Renders the "Listen" section on the home page: an embedded player (with a backup) and streaming links. Needs data/music.js and js/util.js.
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
  const EMPTY = `<div class="player-empty"><span>&gt; awaiting signal</span><span class="cursor">first release incoming</span></div>`;

  // Returns { src, host } for an https link to a known player, or null.
  function vet(url) {
    try {
      const u = new URL(url);
      // A normal Spotify share link (open.spotify.com/album/...) only plays when framed as /embed/album/...
      if (u.hostname === "open.spotify.com" && !u.pathname.startsWith("/embed/")) u.pathname = "/embed" + u.pathname;
      const ok = u.protocol === "https:" && PLAYERS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
      return ok ? { src: u.href, host: u.hostname } : null;
    } catch {
      return null;
    }
  }

  function frame({ src, host }) {
    // Spotify's, SoundCloud's and Deezer's players are short; the others need a 16:9 frame.
    const tall = !/spotify|soundcloud|deezer/.test(host);
    return `<iframe class="player${tall ? " tall" : ""}" src="${escapeHTML(src)}"
      title="${escapeHTML(MUSIC.embedTitle || "Music player")}" loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
  }

  // YouTube goes through its official player API so that if a video can't play for this visitor
  // (not released in their country, embedding blocked, offline), the backup player takes over instead of an error box.
  function youtube(id, backup) {
    const fail = () => (player.innerHTML = backup ? frame(backup) : EMPTY);
    player.innerHTML = `<div class="player tall"><div id="yt-player"></div></div>`;
    const api = document.createElement("script");
    api.src = "https://www.youtube.com/iframe_api";
    api.onerror = fail;
    api.onload = () =>
      window.YT.ready(() => {
        new window.YT.Player("yt-player", {
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1 },
          events: { onError: fail }
        });
      });
    document.head.append(api);
  }

  const main = vet(MUSIC.embedUrl);
  const backup = vet(MUSIC.fallbackEmbedUrl);
  const ytId = main && /youtube/.test(main.host) && (main.src.match(/\/embed\/([\w-]{11})/) || [])[1];
  if (ytId) youtube(ytId, backup);
  else if (main || backup) player.innerHTML = frame(main || backup);
  else player.innerHTML = EMPTY;

  const live = (MUSIC.platforms || []).filter((p) => isSet(p.url));
  platforms.innerHTML = live.length
    ? (MUSIC.platformsLabel ? `<span class="platforms-label">${escapeHTML(MUSIC.platformsLabel)}</span>` : "") +
      live.map((p) => `<a class="btn ghost" href="${escapeHTML(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.name)}</a>`).join("")
    : `<p class="empty">Streaming links land here with the first release. <a href="#newsletter">Get told first</a>.</p>`;
})();
