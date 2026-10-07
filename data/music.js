// Music shown in the "Listen" section of the home page.
// `embedUrl`: the main player. YouTube (www.youtube.com/embed/VIDEO_ID) plays the full track for everyone and every play
// counts as a YouTube view. Spotify/Apple Music/Deezer embeds play 30-second previews unless the visitor is logged in.
// Other accepted links: Spotify share or embed links, SoundCloud, Deezer, Bandcamp and Apple Music embed links.
// `fallbackEmbedUrl`: used if the main player can't play for a visitor (e.g. YouTube not available in their country).
// `platforms`: where to stream. Entries with an empty or bare-domain url are hidden.
window.MUSIC = {
  // HAIL, single, released 2025-10-15.
  embedUrl: "https://www.youtube.com/embed/EzVo6Mc8Yt0",
  fallbackEmbedUrl: "https://widget.deezer.com/widget/dark/track/3605198432",
  embedTitle: "HAIL by Glitches & Stitches",
  platformsLabel: "Stream HAIL on",
  platforms: [
    { name: "Spotify", url: "" },
    { name: "YouTube Music", url: "https://music.youtube.com/watch?v=EzVo6Mc8Yt0" },
    { name: "Apple Music", url: "https://music.apple.com/us/album/hail/1847091235?i=1847091237" },
    { name: "Deezer", url: "https://www.deezer.com/track/3605198432" },
    { name: "SoundCloud", url: "" },
    { name: "Bandcamp", url: "" },
    { name: "Beatport", url: "" }
  ]
};
