// HTML for the community's public pages (docs/community.md, "Rendering"): the heading and main areas server/community/
// page.js puts into the /community template. Every value from the database is escaped here; post bodies only ever go
// through the one formatter (format.js). The HTML is the same for every visitor: votes and controls arrive later from
// the API, so pages can be cached at the edge.
import { format } from "./format.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const spacePath = (space) => `/community/${space.slug}`;
export const channelPath = (space, channel) => `/community/${space.slug}/${channel.slug}`;
export const threadPath = (t) => `/community/t/${t.id}${t.slug ? "-" + t.slug : ""}`;

const TYPE_LABEL = { discussion: "Discussion", question: "Question", update: "Update", poll: "Poll", challenge: "Challenge" };
const STATE_NOTE = { read_only: "This space is read-only for now.", archived: "This space is archived: you can read it, but nothing new can be posted." };
const day = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const who = (name) => (name ? esc(name) : '<span class="cm-deleted">deleted user</span>');
const badge = (space) => (space.kind === "community" && !space.official ? '<span class="cm-badge cm-unofficial">Unofficial</span>'
  : space.official || space.kind !== "community" ? '<span class="cm-badge cm-official">Official</span>' : "");

export const hero = (crumbs, kicker, title, sub = "") => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map(([label, href], i) =>
  i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(label)}</span></li>` : `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ol></nav>
        <p class="detail-kicker">${kicker}</p>
        <h1>${esc(title)}</h1>
        ${sub ? `<p>${sub}</p>` : ""}`;

function threadRow(t, { showSpace = null } = {}) {
  const meta = [TYPE_LABEL[t.type] || "Discussion", `${t.score} upvote${t.score === 1 ? "" : "s"}`, `${t.replyCount} repl${t.replyCount === 1 ? "y" : "ies"}`,
    `by ${who(t.author)}`, day(t.lastPostAt)];
  if (showSpace) meta.unshift(`<a href="${esc(spacePath(showSpace))}">${esc(showSpace.name)}</a>`);
  return `<li class="cm-thread${t.pinned ? " cm-pinned" : ""}">
            <a class="cm-thread-title" href="${esc(threadPath(t))}">${t.pinned ? '<span class="cm-badge">Pinned</span> ' : ""}${t.acceptedPostId ? '<span class="cm-badge cm-answered">Answered</span> ' : ""}${esc(t.title)}</a>
            <p class="cm-meta">${meta.join(" · ")}</p>
          </li>`;
}

export function sortNav(base, sort) {
  return `<nav class="cm-sort" aria-label="Sort threads">${["hot", "new", "top"].map((s) =>
    `<a href="${esc(base)}${s === "hot" ? "" : "?sort=" + s}"${s === sort ? ' aria-current="true"' : ""}>${s[0].toUpperCase() + s.slice(1)}</a>`).join("")}</nav>`;
}

export function threadList(threads, { empty = "No threads yet.", spaces = null, base = "", sort = "hot", page = 1, more = false } = {}) {
  if (!threads.length) return `<p class="cm-empty">${esc(empty)}</p>`;
  const q = (p) => `${esc(base)}?${sort === "hot" ? "" : `sort=${sort}&amp;`}page=${p}`;
  const pager = page > 1 || more ? `<nav class="cm-pager" aria-label="Pages">${page > 1 ? `<a href="${q(page - 1)}" rel="prev">Newer</a>` : ""}${more ? `<a href="${q(page + 1)}" rel="next">Older</a>` : ""}</nav>` : "";
  return `<ul class="cm-threads">${threads.map((t) => threadRow(t, { showSpace: spaces && spaces.get(t.spaceId) })).join("")}
        </ul>${pager}`;
}

export function spaceList(spaces) {
  if (!spaces.length) return '<p class="cm-empty">No spaces yet.</p>';
  return `<ul class="cm-spaces">${spaces.map((s) => `<li class="cm-space"><a href="${esc(spacePath(s))}"><strong>${esc(s.name)}</strong> ${badge(s)}</a>${s.description ? `<p>${esc(s.description)}</p>` : ""}</li>`).join("")}</ul>`;
}

export function spaceAside(space, channels, current = null) {
  return `<aside class="cm-aside">
          ${STATE_NOTE[space.state] ? `<p class="cm-note" role="note">${STATE_NOTE[space.state]}</p>` : ""}
          <nav aria-label="Channels"><p class="cm-aside-title">Channels</p><ul>
            <li><a href="${esc(spacePath(space))}"${current ? "" : ' aria-current="page"'}>All</a></li>
            ${channels.map((c) => `<li><a href="${esc(channelPath(space, c))}"${current && current.id === c.id ? ' aria-current="page"' : ""}>${esc(c.name)}</a></li>`).join("")}
          </ul></nav>
          ${space.rules ? `<details class="cm-rules"><summary>This space's rules</summary>${format(space.rules)}</details>` : ""}
          <p class="cm-small">Every space follows the <a href="/community-rules">community rules</a>.</p>
        </aside>`;
}

function post(p, { accepted = false, opening = false } = {}) {
  if (p.state !== "visible") {
    return `<article class="cm-post cm-post-gone" id="${esc(p.id)}"><p class="cm-meta">${p.state === "hidden" ? "Hidden while the space's team reviews it." : "Removed."}</p></article>`;
  }
  return `<article class="cm-post${accepted ? " cm-accepted" : ""}${opening ? " cm-opening" : ""}" id="${esc(p.id)}">
          <p class="cm-meta">${accepted ? '<span class="cm-badge cm-answered">Accepted answer</span> ' : ""}${who(p.author)} · <time datetime="${esc(p.createdAt)}">${day(p.createdAt)}</time>${p.editedAt ? " · edited" : ""}${!opening && p.helpful ? ` · ${p.helpful} found this helpful` : ""}</p>
          <div class="cm-body">${format(p.body)}</div>
        </article>`;
}

// A thread: the opening post, then (for a question) the accepted answer and the others by Helpful votes, else replies
// in order.
export function threadMain(thread, posts) {
  const [opening, ...replies] = posts;
  let ordered = replies;
  if (thread.type === "question") {
    const accepted = replies.find((p) => p.id === thread.acceptedPostId);
    const rest = replies.filter((p) => p !== accepted).sort((a, b) => (b.helpful - a.helpful) || a.createdAt.localeCompare(b.createdAt));
    ordered = accepted ? [accepted, ...rest] : rest;
  }
  const label = thread.type === "question" ? "answer" : "repl";
  const count = replies.length;
  return `${opening ? post(opening, { opening: true }) : ""}
        <h2 class="cm-replies-title">${count} ${label}${label === "repl" ? (count === 1 ? "y" : "ies") : count === 1 ? "" : "s"}</h2>
        ${ordered.map((p) => post(p, { accepted: p.id === thread.acceptedPostId })).join("\n")}
        ${thread.locked ? '<p class="cm-note" role="note">This thread is locked: no new replies.</p>' : ""}`;
}
