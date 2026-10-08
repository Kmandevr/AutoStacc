// What a buyer may do with each kind of product: the licences on /license and in every product page's licence box
// (scripts/lib/trust-pages.js, scripts/lib/pages.js). A kind of product points at one of these with `license` in
// data/product-types.js; change the terms here once and every page follows. Chosen by the owner (docs/decisions.md).
// Fields: title, summary (one line for product pages), allowed and notAllowed (lists shown as "You can" and
// "You can't"). Text may use [label](/path) and **bold**.
window.LICENSES = {
  sounds: {
    title: "Sound licence",
    summary: "Royalty-free in your own music, including music you sell or stream. The files themselves stay yours alone.",
    allowed: [
      "Use the sounds and presets in your own tracks, remixes, beats, film or game audio and live sets.",
      "Release, sell and stream that music anywhere, with no credit, fees or royalties owed.",
      "Change, chop, process and resample them as much as you like."
    ],
    notAllowed: [
      "Share, upload, give away or resell the raw files or presets, changed or not.",
      "Put them into another sample pack, preset bank, sound library or product for other producers.",
      "Register the raw sounds with a content-ID service as your own."
    ]
  },
  stems: {
    title: "Remix stem licence",
    summary: "Make remixes and release them, even for money, as long as you credit the original artist.",
    allowed: [
      "Remix, rework and edit the stems into your own version.",
      "Release, sell and stream your remix, credited as a remix of the original by its artist.",
      "Play your remix in live and DJ sets."
    ],
    notAllowed: [
      "Release the stems, or the original track, unchanged or nearly unchanged.",
      "Share, upload or resell the stems themselves.",
      "Present the remix as an official release, or leave out the credit to the original artist."
    ]
  },
  music: {
    title: "Music licence",
    summary: "For your own listening and your own DJ sets.",
    allowed: [
      "Listen on any of your own devices, and keep backups.",
      "Play the tracks in your own DJ sets and live mixes."
    ],
    notAllowed: [
      "Upload, stream, share or resell the files.",
      "Use the tracks in your own releases, videos or ads without the artist's permission."
    ]
  },
  visuals: {
    title: "Visuals licence",
    summary: "For your own live shows, streams and screens.",
    allowed: [
      "Show the visuals in your own live sets, events and streams.",
      "Use them as wallpapers and backgrounds on your own devices."
    ],
    notAllowed: [
      "Share, upload or resell the files, changed or not.",
      "Put them into another visual pack or product for others."
    ]
  }
};
