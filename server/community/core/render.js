// HTML for the community's lists and frames (docs/community.md, "Rendering" and "Look and words"): heading, sort tabs,
// takes as channel strips, the mixer row of spaces, a space's side panel, empty states and the composer hook. A take's
// own page is render-thread.js. Every value from the database is escaped here; text people wrote only goes through
// the formatter. Features add their parts through the kit's slots (hooks.js renderKit), so nothing here knows them.
// The HTML is the same for every visitor (it's cached at the edge); per-visitor controls come from the browser script.
import { format } from "./format.js";
import { esc, spacePath, channelPath, threadPath, BARE, day, who, plural } from "./render-parts.js";

export { esc, spacePath, channelPath, threadPath, BARE, day, who, plural };

// The community's words (owner, 2026-10-20): a thread is a take; sorts are Hot, Fresh and Top. Addresses keep hot/new/top.
export const SORT_LABEL = { hot: "Hot", new: "Fresh", top: "Top" };
export const TYPE_LABEL = { discussion: "Discussion", question: "Question", update: "Update", poll: "Poll", challenge: "Challenge" };
const TRACKS = ["teal", "amber", "coral", "lime", "violet"];
export const track = (position) => TRACKS[Math.abs(Number(position) || 0) % TRACKS.length];
const STATE_NOTE = { read_only: "This space is read-only for now.", archived: "This space is archived: you can read it, but nothing new can be posted." };
const badge = (space) => (space.kind === "community" && !space.official ? '<span class="cm-badge cm-unofficial">Unofficial</span>' : '<span class="cm-badge cm-official">Official</span>');

export const hero = (crumbs, kicker, title, sub = "") => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map(([label, href], i) =>
  i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(label)}</span></li>` : `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ol></nav>
        <p class="detail-kicker">${kicker}</p>
        <h1>${esc(title)}</h1>
        ${sub ? `<p>${sub}</p>` : ""}`;

// A friendly empty state with a tiny stack of blocks (owner: empty-state lines).
export const emptyState = (line) => `<div class="cm-empty"><svg class="cm-empty-art" viewBox="0 0 48 40" aria-hidden="true">
            <rect x="6" y="26" width="36" height="10" rx="3"/><rect x="11" y="14" width="26" height="10" rx="3"/><rect x="17" y="2" width="14" height="10" rx="3"/></svg>
          <p>${esc(line)}</p></div>`;

// A take in a list: a channel strip with its channel's track colour, its title, and small meters from the features.
function strip(t, kit, { showSpace = null } = {}) {
  const meta = [TYPE_LABEL[t.type] || "Discussion", ...(t.channelName ? [esc(t.channelName)] : []), `by ${who(t.author, kit)}`, day(t.lastPostAt)];
  if (showSpace) meta.unshift(`<a href="${esc(spacePath(showSpace))}">${esc(showSpace.name)}</a>`);
  return `<li class="cm-strip${t.pinned ? " cm-pinned" : ""}" data-track="${track(t.channelPosition)}" data-space="${esc(t.spaceId)}">
            <div class="cm-strip-main">
              <a class="cm-strip-title" href="${esc(threadPath(t))}">${t.pinned ? '<span class="cm-badge">Pinned</span> ' : ""}${kit.slot("listBadges", { thread: t })}${esc(t.title)}</a>
              <p class="cm-meta">${meta.join(" · ")}</p>
            </div>
            <div class="cm-strip-meters">${kit.slot("listMeters", { thread: t })}<span class="cm-replies" title="${plural(t.replyCount, "reply", "replies")}" aria-label="${plural(t.replyCount, "reply", "replies")}">${t.replyCount}</span></div>
          </li>`;
}

export function sortNav(base, sort) {
  return `<nav class="cm-sort" aria-label="Sort takes">${["hot", "new", "top"].map((s) =>
    `<a href="${esc(base)}${s === "hot" ? "" : "?sort=" + s}"${s === sort ? ' aria-current="true"' : ""}>${SORT_LABEL[s]}</a>`).join("")}</nav>`;
}

export function threadList(threads, { kit = BARE, empty = "No takes yet. Be the first.", spaces = null, base = "", sort = "hot", page = 1, more = false } = {}) {
  if (!threads.length) return emptyState(empty);
  const q = (p) => `${esc(base)}?${sort === "hot" ? "" : `sort=${sort}&amp;`}page=${p}`;
  const pager = page > 1 || more ? `<nav class="cm-pager" aria-label="Pages">${page > 1 ? `<a href="${q(page - 1)}" rel="prev">Newer</a>` : ""}${more ? `<a href="${q(page + 1)}" rel="next">Older</a>` : ""}</nav>` : "";
  return `<ul class="cm-strips">${threads.map((t) => strip(t, kit, { showSpace: spaces && spaces.get(t.spaceId) })).join("")}
        </ul>${pager}`;
}

// The front page's row of spaces, like mixer channels: name, Official or Unofficial, and a meter of this week's takes.
export function mixer(spaces, activity) {
  if (!spaces.length) return emptyState("No spaces yet.");
  const top = Math.max(1, ...spaces.map((s) => activity.get(s.id) || 0));
  return `<ul class="cm-mixer" aria-label="Spaces">${spaces.map((s, i) => {
    const n = activity.get(s.id) || 0;
    const level = Math.round((n / top) * 8);
    return `<li class="cm-channel" data-track="${track(i)}"><a href="${esc(spacePath(s))}">
              <span class="cm-channel-meter" aria-hidden="true">${Array.from({ length: 8 }, (_, k) => `<i${k < level ? ' class="on"' : ""}></i>`).reverse().join("")}</span>
              <strong>${esc(s.name)}</strong>${badge(s)}
              <span class="cm-small">${plural(n, "take", "takes")} this week</span></a></li>`;
  }).join("")}</ul>`;
}

export function questionBox(questions) {
  if (!questions.length) return "";
  return `<section class="cm-box" aria-labelledby="cm-unanswered"><h2 id="cm-unanswered">Help a newcomer</h2>
          <p class="cm-small">Questions nobody has answered yet.</p>
          <ul>${questions.map((t) => `<li><a href="${esc(threadPath(t))}">${esc(t.title)}</a></li>`).join("")}</ul></section>`;
}

export function spaceAside(space, channels, current = null, kit = BARE) {
  return `<aside class="cm-aside">
          ${STATE_NOTE[space.state] ? `<p class="cm-note" role="note">${STATE_NOTE[space.state]}</p>` : ""}
          <nav aria-label="Channels"><p class="cm-aside-title">Channels</p><ul>
            <li><a href="${esc(spacePath(space))}"${current ? "" : ' aria-current="page"'}>All takes</a></li>
            ${channels.map((c) => `<li data-track="${track(c.position)}"><a href="${esc(channelPath(space, c))}"${current && current.id === c.id ? ' aria-current="page"' : ""}><span class="cm-dot" aria-hidden="true"></span>${esc(c.name)}</a></li>`).join("")}
          </ul></nav>
          ${space.rules ? `<details class="cm-rules"><summary>This space's rules</summary>${format(space.rules, kit.format)}</details>` : ""}
          <p class="cm-small">Every space follows the <a href="/community-rules">community rules</a>.</p>
        </aside>`;
}

// Where features' browser scripts put a space team's desk (reports, appeals, the log...) and a visitor's own notices
// (a post of theirs a team took down, with why). Empty and hidden: the scripts ask the API before showing anything.
export const spaceHook = (space) => `<section class="cm-desk" data-cm-space="${esc(space.id)}" aria-label="Team desk" hidden></section>`;
export const noticesHook = () => '<div class="cm-notices" data-cm-notices hidden></div>';

// Where the browser script (js/community.js) puts the "New take" form: the channels a visitor may post in, as JSON in
// an attribute (escaped like any value). The script asks the API who the visitor is before showing anything.
export function composeHook(space, channels, current = null) {
  const list = (current ? [current] : channels).map((c) => ({ id: c.id, name: c.name, types: c.postTypes.split(",").filter((t) => t === "discussion" || t === "question" || t === "update"), team: c.whoMayStart === "team" }))
    .filter((c) => c.types.length);
  if (!list.length || space.state !== "open") return "";
  return `<div class="cm-compose" data-cm-compose="${esc(JSON.stringify(list))}" hidden></div>`;
}
