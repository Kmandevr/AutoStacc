// Music and video embeds for creator sites: only these providers, only from their public share links, turned into
// their own embed players. The iframe address is built here from parts we parsed, never copied from the creator's
// text, and the page's CSP (sites/render.js) allows frames from these hosts only. Unknown links are refused.
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const PROVIDERS = [
  {
    id: "youtube",
    name: "YouTube",
    host: "https://www.youtube-nocookie.com",
    parse(u) {
      let v = null;
      if (/^(www\.|m\.|music\.)?youtube\.com$/.test(u.hostname)) {
        v = u.pathname === "/watch" ? u.searchParams.get("v") : (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/) || [])[1];
      } else if (u.hostname === "youtu.be") v = u.pathname.slice(1);
      return v && ID.test(v) ? { src: `https://www.youtube-nocookie.com/embed/${v}`, height: 315, ratio: "16 / 9" } : null;
    }
  },
  {
    id: "spotify",
    name: "Spotify",
    host: "https://open.spotify.com",
    parse(u) {
      if (u.hostname !== "open.spotify.com") return null;
      const m = u.pathname.replace(/^\/intl-[a-z-]+/, "").match(/^\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})$/);
      return m ? { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === "track" ? 152 : 352 } : null;
    }
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    host: "https://w.soundcloud.com",
    parse(u) {
      if (!/^(www\.|m\.)?soundcloud\.com$/.test(u.hostname)) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^[A-Za-z0-9_-]{1,100}$/.test(p))) return null;
      const track = `https://soundcloud.com/${parts.join("/")}`;
      return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}&visual=false`, height: parts.length === 1 ? 450 : 166 };
    }
  },
  {
    id: "apple-music",
    name: "Apple Music",
    host: "https://embed.music.apple.com",
    parse(u) {
      if (u.hostname !== "music.apple.com") return null;
      const m = u.pathname.match(/^\/([a-z]{2})\/(album|playlist|artist)\/([a-z0-9-]{0,120})\/?([a-z0-9.]{1,40})$/i);
      if (!m) return null;
      const track = u.searchParams.get("i");
      const q = track && /^\d{1,20}$/.test(track) ? `?i=${track}` : "";
      return { src: `https://embed.music.apple.com/${m[1].toLowerCase()}/${m[2]}/${m[3]}/${m[4]}${q}`, height: q ? 175 : 450 };
    }
  }
];

export const EMBED_HOSTS = PROVIDERS.map((p) => p.host);
export const EMBED_PROVIDERS = PROVIDERS.map((p) => p.name);

// { provider, src, height, ratio? } for a share link we know, or null.
export function embedFor(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  for (const p of PROVIDERS) {
    const found = p.parse(u);
    if (found) return { provider: p.id, title: p.name, ...found };
  }
  return null;
}
