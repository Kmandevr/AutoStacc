// A take's own page (docs/community.md): the opening post, then its replies as a tree, any depth (owner, 2026-10-20).
// Top-level replies come in the order the kit's arrange hook gives (Q&A puts the best answer first); replies to a
// reply follow in time order. Past FOLD_DEPTH a branch folds behind "more replies", and the indent stops growing
// (css/community.css), so deep trees stay readable on phones. Hidden and removed posts keep their place as a short
// placeholder so the replies under them still make sense. Features add parts through slots: postBadges, postFooter.
import { format } from "./format.js";
import { esc, day, who, BARE, plural } from "./render-parts.js";

export const FOLD_DEPTH = 6;
const MAX_DEPTH = 50;

function postHtml(p, kit, { opening = false, thread }) {
  if (p.state !== "visible") {
    return `<article class="cm-post cm-post-gone" id="${esc(p.id)}"><p class="cm-meta">${p.state === "hidden" ? "Hidden while the space's team reviews it." : "Removed."}</p></article>`;
  }
  const ctx = { post: p, thread, opening };
  return `<article class="cm-post${opening ? " cm-opening" : ""}${kit.slot("postClass", ctx)}" id="${esc(p.id)}" data-cm-post>
          <p class="cm-meta">${kit.slot("postBadges", ctx)}${who(p.author, kit)} · <time datetime="${esc(p.createdAt)}">${day(p.createdAt)}</time>${p.editedAt ? " · edited" : ""}</p>
          <div class="cm-body">${format(p.body, kit.format)}</div>
          ${kit.slot("postFooter", ctx)}
        </article>`;
}

function branch(p, children, kit, thread, depth) {
  const kids = children.get(p.id) || [];
  const inner = kids.length && depth < MAX_DEPTH ? replies(kids, children, kit, thread, depth + 1) : "";
  const folded = depth + 1 >= FOLD_DEPTH && kids.length
    ? `<details class="cm-fold"><summary>${plural(count(p.id, children), "more reply", "more replies")}</summary>${inner}</details>` : inner;
  return `<li class="cm-reply" data-depth="${Math.min(depth, FOLD_DEPTH)}">${postHtml(p, kit, { thread })}${folded}</li>`;
}

const replies = (list, children, kit, thread, depth) =>
  `<ol class="cm-replies">${list.map((p) => branch(p, children, kit, thread, depth)).join("")}</ol>`;

function count(id, children) {
  const kids = children.get(id) || [];
  return kids.reduce((n, k) => n + 1 + count(k.id, children), 0);
}

export function threadMain(thread, posts, kit = BARE) {
  const [opening, ...rest] = posts;
  const ids = new Set(rest.map((p) => p.id));
  // A reply whose parent isn't in this take (or is the opening post) sits at the top level.
  const children = new Map();
  const top = [];
  for (const p of rest) {
    if (p.parentId && ids.has(p.parentId)) children.set(p.parentId, [...(children.get(p.parentId) || []), p]);
    else top.push(p);
  }
  const ordered = kit.arrange(thread, top);
  const shown = rest.filter((p) => p.state === "visible").length;
  const word = thread.type === "question" ? ["answer", "answers"] : ["reply", "replies"];
  return `${opening ? postHtml(opening, kit, { opening: true, thread }) : ""}
        ${kit.slot("threadTools", { thread })}
        <h2 class="cm-replies-title">${plural(shown, ...word)}</h2>
        ${ordered.length ? replies(ordered, children, kit, thread, 1) : ""}
        ${thread.locked ? '<p class="cm-note" role="note">This take is locked: no new replies.</p>' : ""}`;
}

// The page's hook for js/community.js: the take's id and type; posts are found by their ids.
export const threadHook = (thread, posts) => `<div class="cm-thread-tools" data-cm-thread="${esc(thread.id)}" data-cm-type="${esc(thread.type)}"
          data-cm-opening="${esc(posts[0] ? posts[0].id : "")}" hidden></div>`;
