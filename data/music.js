// Music shown in the "Listen" section of the home page.
// `embedUrl`: the embed link for the latest release or a playlist (Spotify: Share > Embed > copy the src, or just the
// normal share link; SoundCloud: Share > Embed > copy the src; Deezer: Share > Embed; Apple Music: Share > Embed).
// Empty shows a placeholder. `platforms`: where to stream. Entries with an empty or bare-domain url are hidden.
window.MUSIC = {
  // HAIL, single, released 2025-10-15. Deezer's player shows the artist name spelled correctly.
  embedUrl: "https://widget.deezer.com/widget/dark/track/3605198432",
  embedTitle: "HAIL by Glitches & Stitches",
  platforms: [
    { name: "Spotify", url: "" },
    { name: "Apple Music", url: "https://music.apple.com/us/album/hail/1847091235?i=1847091237" },
    { name: "Deezer", url: "https://www.deezer.com/track/3605198432" },
    { name: "SoundCloud", url: "" },
    { name: "Bandcamp", url: "" },
    { name: "YouTube", url: "" },
    { name: "Beatport", url: "" }
  ]
};
