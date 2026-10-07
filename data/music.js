// Music shown in the "Listen" section of the home page.
// `embedUrl`: the embed link for the latest release or a playlist (Spotify: Share > Embed > copy the src;
// SoundCloud: Share > Embed > copy the src; Bandcamp: Share/Embed > copy the src). Empty shows a placeholder.
// `platforms`: where to stream. Entries with an empty or bare-domain url are hidden.
window.MUSIC = {
  embedUrl: "",
  embedTitle: "Latest release by Glitches & Stitches",
  platforms: [
    { name: "Spotify", url: "" },
    { name: "Apple Music", url: "" },
    { name: "SoundCloud", url: "" },
    { name: "Bandcamp", url: "" },
    { name: "YouTube", url: "" },
    { name: "Beatport", url: "" }
  ]
};
