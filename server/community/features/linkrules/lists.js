// The site-wide link lists (owner, 2026-10-20; docs/community.md, "Links"). SAFE: well-known music and creative sites
// whose links pass at once in every space. BANNED: always refused, and no space can allow them (adult sites, sites that
// download automatically, malware and the like). Both are starting lists AutoStacc's team keeps up; a site matches
// itself and its subdomains. Anything on neither list waits for the space's team unless the space allowed it.
export const SAFE = [
  "soundcloud.com", "youtube.com", "youtu.be", "spotify.com", "music.apple.com", "bandcamp.com", "vimeo.com", "discogs.com",
  "beatport.com", "mixcloud.com", "tidal.com", "deezer.com", "github.com", "wikipedia.org", "ableton.com", "image-line.com",
  "steinberg.net", "bitwig.com", "reaper.fm", "native-instruments.com", "splice.com", "kvraudio.com", "musictech.com"
];
export const BANNED = [
  "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com", "youporn.com", "onlyfans.com", "chaturbate.com"
];

export const siteIn = (raw, list) => {
  const host = String(raw).toLowerCase().replace(/\.+$/, "");
  return list.some((d) => host === d || host.endsWith(`.${d}`));
};

// Addresses that cover many unrelated people's sites: a team can't allow one (it would allow every subdomain).
const SHARED = ["github.io", "blogspot.com", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "wixsite.com", "weebly.com", "wordpress.com", "tumblr.com", "web.app", "firebaseapp.com", "notion.site"];
export const tooBroad = (host) => {
  const labels = host.split(".");
  return SHARED.includes(host) || labels.length < 2 || (labels.length === 2 && labels[1].length === 2 && ["co", "com", "org", "net", "gov", "ac", "edu"].includes(labels[0]));
};
