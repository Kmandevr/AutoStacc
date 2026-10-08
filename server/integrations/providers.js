// Connected accounts (Spotify, SoundCloud, YouTube, Instagram, TikTok, ...): the extension point, with no provider
// switched on yet. A provider is one entry in PROVIDERS; the Studio will offer only what is listed here. The flow each
// will follow: the creator connects through the provider's own OAuth page (authorization code + PKCE, state bound to
// the creator's session), AutoStacc asks for the read-only scopes listed and nothing more, fetches the permitted
// profile data, and the creator chooses what appears on their pages. Rows live in D1 connected_accounts; a token, if
// a provider needs one kept, is encrypted with a key from server/lib/config.js before it is stored, never in plain
// text, and disconnecting revokes it at the provider and blanks it here. Nothing here talks to a provider yet.
//
// Entry shape:
//   id: "spotify"; name: "Spotify";
//   scopes: the minimum read-only scopes, e.g. [] for public profile data only;
//   authorizeUrl, tokenUrl: the provider's OAuth endpoints; clientIdEnv, clientSecretEnv: names of the config secrets;
//   keepsToken: false when the data is fetched once at connect time (preferred), true only if it must refresh;
//   profile(token) -> { accountId, displayName, url, items: [...] }: the data the creator can choose to show.
export const PROVIDERS = {};

export const provider = (id) => (Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id] : null);
export const availableProviders = () => Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, scopes: p.scopes }));
