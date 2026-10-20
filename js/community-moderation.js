// Space teams' tools and the author's notices (the moderation feature, server/community/features/moderation/; needs
// js/community-kit.js). On a take, the space's team gets Pin, Lock, Hide and Remove for the take, and Hide, Remove
// and Ban on each reply, each asking for the reason the author is told. On a space, the team desk lists appeals,
// bans and the team's log. On the community's pages, people see their own posts a team took down, why, and can
// appeal once. Does nothing when the feature is off. The API checks everything again.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, action, status, say, busy } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;
  const STATE = { hidden: "hidden", removed: "removed" };

  // Asks for the reason (the author sees it); null when cancelled.
  const why = (question) => {
    const r = window.prompt(question);
    return r === null ? null : r.trim();
  };
  const modButton = (label, path, payload, ask) => el("button", { class: "btn ghost small", type: "button", text: label, on: { click: async (ev) => {
    const reason = ask ? why(ask) : "";
    if (reason === null) return;
    const b = ev.currentTarget;
    b.disabled = true;
    const r = await api(path, { method: "POST", body: { ...payload, reason } });
    b.disabled = false;
    if (r.ok) location.reload(); else window.alert(r.error.message);
  } } });

  function threadTools(state) {
    const threadId = kit.tools.dataset.cmThread;
    const m = state.features.moderation || {};
    const path = `/api/community/mod/threads/${enc(threadId)}`;
    const bar = el("div", { class: "cm-mod-bar", role: "group", "aria-label": "Team tools for this take" },
      el("span", { class: "cm-small", text: "Team:" }),
      modButton(m.pinned ? "Unpin" : "Pin", path, { action: m.pinned ? "unpin" : "pin" }),
      modButton(m.locked ? "Unlock" : "Lock", path, { action: m.locked ? "unlock" : "lock" }),
      modButton("Hide take", path, { action: "hide" }, "Why hide this take? The author is told."),
      modButton("Remove take", path, { action: "remove" }, "Why remove this take under the space's rules? The author is told."));
    kit.tools.hidden = false;
    kit.tools.append(bar);
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      if (post.id === kit.tools.dataset.cmOpening) return;
      const tools = post.querySelector("[data-cm-tools]") || post.appendChild(el("div", { class: "cm-post-tools", "data-cm-tools": post.id }));
      const p = `/api/community/mod/posts/${enc(post.id)}`;
      tools.append(modButton("Hide", p, { action: "hide" }, "Why hide this reply? The author is told."),
        modButton("Remove", p, { action: "remove" }, "Why remove this reply under the space's rules? The author is told."));
      const name = post.querySelector(".cm-meta .cm-name");
      if (name && !state.ownPosts.some((o) => o.id === post.id)) tools.append(banButton(m.spaceId, name.textContent));
    });
  }

  const banButton = (spaceId, name) => el("button", { class: "btn ghost small", type: "button", text: "Ban", on: { click: async (ev) => {
    const btn = ev.currentTarget;
    const reason = why(`Why ban ${name} from this space? They're told.`);
    if (reason === null) return;
    const days = window.prompt("For how many days? Leave empty for until you lift it.", "7");
    if (days === null) return;
    btn.disabled = true;
    const r = await api(`/api/community/spaces/${enc(spaceId)}/bans`, { method: "PUT", body: { name, reason, days: days.trim() ? Number(days) : null } });
    btn.disabled = false;
    window.alert(r.ok ? `${name} is banned from this space.` : r.error.message);
  } } });

  // A team member's desk on a space: appeals to decide, who's banned, and what the team did.
  async function desk() {
    const spaceId = kit.desk.dataset.cmSpace;
    const appeals = await api(`/api/community/spaces/${enc(spaceId)}/appeals`);
    if (!appeals.ok) return;
    const a = kit.deskPart(`Appeals (${appeals.data.appeals.length})`);
    if (!appeals.data.appeals.length) a.append(el("p", { class: "cm-small", text: "No appeals waiting." }));
    appeals.data.appeals.forEach((x) => a.append(el("article", { class: "cm-desk-item" },
      el("p", { class: "cm-meta", text: `${x.author || "deleted user"} · ${x.title}` }),
      el("blockquote", { text: x.excerpt }),
      el("p", { text: `Their appeal: ${x.note}` }),
      el("div", { class: "cm-post-tools" },
        modButton("Bring it back", `/api/community/appeals/${enc(x.id)}`, { outcome: "granted" }),
        modButton("Keep it down", `/api/community/appeals/${enc(x.id)}`, { outcome: "refused" }, "Why keep it down? They're told.")))));
    const bans = await api(`/api/community/spaces/${enc(spaceId)}/bans`);
    if (bans.ok) {
      const b = kit.deskPart(`Bans (${bans.data.bans.length})`);
      bans.data.bans.forEach((x) => b.append(el("p", { class: "cm-desk-row" },
        `${x.name || "deleted user"}: ${x.reason} (${x.until ? "until " + x.until.slice(0, 10) : "until lifted"}) `,
        x.name ? action("Lift", { path: `/api/community/spaces/${enc(spaceId)}/bans`, method: "DELETE", body: { name: x.name } }) : "")));
      if (!bans.data.bans.length) b.append(el("p", { class: "cm-small", text: "Nobody is banned." }));
    }
    const log = await api(`/api/community/spaces/${enc(spaceId)}/mod-log`);
    if (log.ok) {
      const l = kit.deskPart("Team log");
      const list = l.appendChild(el("ol", { class: "cm-log" }));
      log.data.log.forEach((x) => list.append(el("li", {},
        el("time", { datetime: x.at, text: x.at.slice(0, 16).replace("T", " ") }), " ",
        `${x.automatic ? "Automatic" : x.actor || "deleted user"}: ${x.action.replace(/_/g, " ")} ${x.targetType === "member" ? x.member || "deleted user" : x.targetType}${x.reason ? ` (${x.reason})` : ""}`)));
      if (!log.data.log.length) list.append(el("li", { text: "Nothing yet." }));
    }
  }

  // The visitor's own posts a team took down: why, and an appeal (once).
  async function notices() {
    const r = await api("/api/community/moderated");
    if (!r.ok || !r.data.items.length) return;
    const box = kit.notices;
    box.hidden = false;
    box.append(el("h2", { text: "Taken down from your posts" }));
    r.data.items.forEach((x) => {
      const item = el("article", { class: "cm-notice" },
        el("p", {}, `In ${x.space}: `, x.path ? el("a", { href: x.path, text: x.title }) : x.title,
          ` was ${STATE[x.state] || "taken down"}${x.type === "post" ? " (your reply)" : ""}.`),
        x.reason ? el("p", { class: "cm-small", text: `Why: ${x.reason}` }) : "");
      if (x.legal) item.append(el("p", { class: "cm-small" }, "AutoStacc removed this for a legal reason. To dispute a copyright removal, send a ", el("a", { href: "/copyright#counter", text: "counter-notice" }), "; for anything else, ", el("a", { href: "/contact", text: "contact support" }), "."));
      else if (x.appeal) item.append(el("p", { class: "cm-small", text: x.appeal === "open" ? "Your appeal is with the team." : x.appeal === "granted" ? "Your appeal was granted." : "Your appeal was refused." }));
      else item.append(appealForm(x));
      box.append(item);
    });
  }

  function appealForm(x) {
    const note = el("textarea", { rows: 3, maxlength: 1000, required: true, "aria-label": "Why it should come back" });
    const msg = status();
    const form = el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await api("/api/community/appeals", { method: "POST", body: { targetType: x.type, targetId: x.id, note: note.value } });
      busy(form, false);
      if (!r.ok) return say(msg, r.error.message);
      form.replaceWith(el("p", { class: "cm-small", text: "Sent. The space's team will look again." }));
    } } }, el("details", {}, el("summary", { text: "Appeal" }), note, el("button", { class: "btn small", type: "submit", text: "Send appeal" }), msg));
    return form;
  }

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("moderation") || !who.signedIn) return;
    if (kit.notices && who.member) notices();
    if (kit.tools) {
      const state = await kit.mine();
      if (state && state.team && state.features && state.features.moderation) threadTools(state);
    }
    if (kit.desk) {
      const s = await kit.space();
      if (s && s.team) desk();
    }
  })();
})();
