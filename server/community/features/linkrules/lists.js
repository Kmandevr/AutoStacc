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

export const siteIn = (host, list) => list.some((d) => host === d || host.endsWith(`.${d}`));
