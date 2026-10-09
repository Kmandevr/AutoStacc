// News and updates. Order doesn't matter, newest is shown first. Each published post gets its own page at
// /<creator>/<project>/news/<id>.
// `id`: lowercase-hyphenated, the page address. Never change it once published.
// `summary` is plain text (home page and search description). `body` may contain simple HTML (news page and post page).
// `project`: id of the project the post is from (data/projects.js). Required: the post lives at /projects/<project>/news/<id>.
// `release`: optional id of the release in data/music.js the post is about (linked from the post).
// `draft: true`: placeholder, not real news. Hidden on the site and kept out of search until it is real.
window.NEWS = [
  {
    id: "hail-out-now",
    project: "glitches-and-stitches",
    date: "2025-10-15",
    title: "HAIL is out now",
    tag: "Release",
    release: "hail",
    summary: "The single HAIL is out on Apple Music, YouTube Music, Deezer and more.",
    body: "<p>HAIL is out now. Play it on the <a href=\"/autostacc/glitches-and-stitches/music/hail\">HAIL release page</a>, or stream it on <a href=\"https://music.apple.com/us/album/hail/1847091235?i=1847091237\" target=\"_blank\" rel=\"noopener\">Apple Music</a>, <a href=\"https://music.youtube.com/watch?v=EzVo6Mc8Yt0\" target=\"_blank\" rel=\"noopener\">YouTube Music</a> and <a href=\"https://www.deezer.com/album/838974702\" target=\"_blank\" rel=\"noopener\">Deezer</a>.</p>"
  },
  {
    id: "fall-tour-dates",
    project: "glitches-and-stitches",
    date: "2026-09-18",
    title: "Fall tour dates announced",
    tag: "Tour",
    summary: "Five cities, new visuals, and a few unreleased IDs.",
    body: "<p>We're hitting the road this fall. Full dates are on the shows list, and tickets go fast.</p>",
    draft: true
  },
  {
    id: "frayed-signals-sample-pack",
    project: "glitches-and-stitches",
    date: "2026-09-02",
    title: "Frayed Signals sample pack drops",
    tag: "Shop",
    summary: "Our first sample pack, built from the sounds in our live set.",
    body: "<p>Every glitch, stutter and crunch from the live set, cut up and labelled. Grab it in the shop.</p>",
    draft: true
  }
];
