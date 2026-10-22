// Small pieces both community renderers use (render.js for lists, render-thread.js for a take): escaping, addresses,
// dates, a person's name with the features' mark beside it, plurals, and the empty kit.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A project space lives at its project's address (space.canonical, /<creator>/<project>/community); others under /community.
export const spacePath = (space) => space.canonical || `/community/${space.slug}`;
export const channelPath = (space, channel) => `${spacePath(space)}/${channel.slug}`;
export const threadPath = (t) => `/community/t/${t.id}${t.slug ? "-" + t.slug : ""}`;

// A kit with no features (tests, or every feature switched off): slots render nothing, replies keep their order.
export const BARE = { slot: () => "", arrange: (t, r) => r, format: { links: [], blocks: [] } };

export const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const who = (name, kit = BARE) => `<span class="cm-who">${kit.slot("nameMark", { name })}${name ? `<span class="cm-name">${esc(name)}</span>` : '<span class="cm-deleted">deleted user</span>'}</span>`;
