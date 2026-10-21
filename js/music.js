// Listen, a drop-in for any [data-listen] element: an embedded player (with a backup) for one release and, with
// data-links, that release's streaming links under it. data-release picks the release (a release page; counts as a
// release view); otherwise the project's release marked featured in the Studio, else its newest. data-project picks the
// project (default: the open project's; none: every project's newest). Releases come from the content API through
// js/project-content.js. Outside the project's pages it wears the project's look. Needs data/projects.js, js/util.js
// and js/project-content.js.
(function () {
  "use strict";

  const { escapeHTML, isSet, parseDate, moduleProject, wear, content } = window.GS;
  const PROJECTS = window.PROJECTS || [];
  const boxes = [...document.querySelectorAll("[data-listen]")];
  if (!boxes.length || !content) return;
  const newest = (list) => list.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date));

  // Only well-known players are embedded, so a typo can't load an unrelated page into the site.
  const PLAYERS = ["open.spotify.com", "w.soundcloud.com", "widget.deezer.com", "bandcamp.com", "embed.music.apple.com",
    "www.youtube.com", "www.youtube-nocookie.com"];
  const EMPTY = `<div class="player-empty"><span>&gt; awaiting signal</span><span class="cursor">first release incoming</span></div>`;
  let ytCount = 0; // each YouTube player gets its own element id

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

  // The YouTube player API loads once per page; every player waits for it.
  let ytApi = null;
  function youtubeApi() {
    ytApi = ytApi || new Promise((resolve, reject) => {
      const api = document.createElement("script");
      api.src = "https://www.youtube.com/iframe_api";
      api.onerror = reject;
      api.onload = () => window.YT.ready(resolve);
      document.head.append(api);
    });
    return ytApi;
  }

  async function mount(box) {
    const project = moduleProject(box);
    const mine = newest((await content.forProject(project)).releases).filter((r) => !project || r.project === project);
    const release = mine.find((r) => r.id === box.dataset.release) || mine.find((r) => r.featured) || mine[0] || {};
    const artist = release.projectName || (PROJECTS.find((p) => p.id === release.project) || {}).name || "";
    // A release page (not a Listen section) counts as a release view (privacy-friendly, js/util.js).
    if (box.dataset.release && release.id) window.GS.track("release_view", release.id);
    wear(box, release.project || project);
    box.innerHTML = `<div class="listen-player"></div>${"links" in box.dataset ? `<div class="platforms"></div>` : ""}`;
    const player = box.querySelector(".listen-player");
    const platforms = box.querySelector(".platforms");

    function frame({ src, host }) {
      // Spotify's, SoundCloud's and Deezer's players are short; the others need a 16:9 frame.
      const tall = !/spotify|soundcloud|deezer/.test(host);
      return `<iframe class="player${tall ? " tall" : ""}" src="${escapeHTML(src)}"
        title="${escapeHTML(release.title ? `${release.title} by ${artist}` : "Music player")}" loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    }

    // YouTube goes through its official player API so that if a video can't play for this visitor
    // (not released in their country, embedding blocked, offline), the backup player takes over instead of an error box.
    function youtube(id, backup) {
      const fail = () => (player.innerHTML = backup ? frame(backup) : EMPTY);
      const slot = `yt-player-${++ytCount}`;
      player.innerHTML = `<div class="player tall"><div id="${slot}"></div></div>`;
      youtubeApi().then(() => {
        new window.YT.Player(slot, {
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1 },
          events: { onError: fail }
        });
      }, fail);
    }

    const main = vet(release.embedUrl);
    const backup = vet(release.fallbackEmbedUrl);
    const ytId = main && /youtube/.test(main.host) && (main.src.match(/\/embed\/([\w-]{11})/) || [])[1];
    if (ytId) youtube(ytId, backup);
    else if (main || backup) player.innerHTML = frame(main || backup);
    else player.innerHTML = EMPTY;

    // Release pages list their streaming links in the page itself; a Listen section asks for them with data-links.
    if (!platforms) return;
    const live = (release.links || []).filter((p) => isSet(p.url));
    platforms.innerHTML = live.length
      ? `<span class="platforms-label">Stream ${escapeHTML(release.title)} on</span>` +
        live.map((p) => `<a class="btn ghost" href="${escapeHTML(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.name)}</a>`).join("") +
        `<a class="btn" href="${escapeHTML(content.href(release, "music"))}">${escapeHTML(release.title)}: release page</a>`
      : `<p class="empty">Streaming links land here with the first release. <a href="#newsletter">Get told first</a>.</p>`;
  }

  boxes.forEach(mount);
})();
