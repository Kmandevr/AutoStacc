// The community core's forms (docs/community.md, "Look and words"; needs js/community-kit.js): the composer (Write and
// Preview tabs, formatting buttons, drafts kept in this browser), "New take" on spaces and channels, and on a take the
// reply box, Reply under each post (nested), and Edit and Delete on the visitor's own posts within 24 hours. Features
// add their own buttons from their own scripts. The API checks everything again.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, status, say, busy, me, mine, gate, tools, asPicker } = kit;
  const api = window.GS.api;
  const EDIT_MS = 24 * 3600 * 1000;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Drafts live only in this browser (and only until posted); a blocked or full storage just means no draft.
  const draft = {
    get: (k) => { try { return localStorage.getItem("cm-draft:" + k) || ""; } catch { return ""; } },
    set: (k, v) => { try { if (v) localStorage.setItem("cm-draft:" + k, v); else localStorage.removeItem("cm-draft:" + k); } catch { /* no draft */ } }
  };

  const WRAP = { Bold: ["**", "**"], Italic: ["*", "*"], Code: ["`", "`"], Link: ["[", "](https://)"] };
  const LINE = { List: "- ", Quote: "> " };

  // A text box with formatting buttons and, when the preview feature is on, Write / Preview tabs.
  function composer({ label, value = "", draftKey = null, preview }) {
    const box = el("textarea", { rows: 6, maxlength: 10000, required: true, "aria-label": label });
    box.value = value || (draftKey ? draft.get(draftKey) : "");
    if (draftKey) box.addEventListener("input", () => draft.set(draftKey, box.value));
    const insert = (before, after = "") => {
      const [s, e] = [box.selectionStart, box.selectionEnd];
      box.setRangeText(before + box.value.slice(s, e) + after, s, e, "end");
      box.focus();
      box.dispatchEvent(new Event("input"));
    };
    const bar = el("div", { class: "cm-toolbar", role: "toolbar", "aria-label": "Formatting" },
      Object.entries(WRAP).map(([name, [a, b]]) => el("button", { type: "button", class: "cm-tool", text: name, on: { click: () => insert(a, b) } })),
      Object.entries(LINE).map(([name, mark]) => el("button", { type: "button", class: "cm-tool", text: name, on: { click: () => {
        const at = box.value.lastIndexOf("\n", box.selectionStart - 1) + 1;
        box.setRangeText(mark, at, at, "end");
        box.focus();
      } } })));
    const shown = el("div", { class: "cm-body cm-preview", hidden: true, "aria-live": "polite" });
    let tabs = null;
    if (preview) {
      const write = el("button", { type: "button", role: "tab", "aria-selected": "true", text: "Write" });
      const look = el("button", { type: "button", role: "tab", "aria-selected": "false", text: "Preview" });
      write.addEventListener("click", () => { write.setAttribute("aria-selected", "true"); look.setAttribute("aria-selected", "false"); shown.hidden = true; box.hidden = false; bar.hidden = false; box.focus(); });
      look.addEventListener("click", async () => {
        write.setAttribute("aria-selected", "false"); look.setAttribute("aria-selected", "true");
        const r = await api("/api/community/preview", { method: "POST", body: { body: box.value } });
        // The server's own formatting: the same HTML the post will have, escaped and checked there.
        shown.innerHTML = r.ok ? r.data.html || "<p class=\"cm-small\">Nothing to preview yet.</p>" : "<p class=\"cm-small\">The preview isn't available right now.</p>";
        shown.hidden = false; box.hidden = true; bar.hidden = true;
      });
      tabs = el("div", { class: "cm-tabs", role: "tablist", "aria-label": "Write or preview" }, write, look);
    }
    const wrap = el("div", { class: "cm-composer" }, tabs, bar, box, shown);
    return { wrap, box, clear: () => { box.value = ""; if (draftKey) draft.set(draftKey, ""); } };
  }

  const TYPE = { discussion: "Discussion", question: "Question", update: "Update" };

  function newTakeForm(box, channels, who, teamName) {
    const msg = status();
    const as = asPicker(who, teamName);
    const channel = el("select", { name: "channel" }, channels.map((c) => el("option", { value: c.id, text: c.name })));
    const type = el("select", { name: "type" });
    const fillTypes = () => type.replaceChildren(...channels.find((c) => c.id === channel.value).types.map((t) => el("option", { value: t, text: TYPE[t] })));
    channel.addEventListener("change", fillTypes);
    fillTypes();
    const title = el("input", { name: "title", required: true, minlength: 5, maxlength: 150 });
    const text = composer({ label: "Text", draftKey: "take:" + location.pathname, preview: who.features.includes("preview") });
    const form = el("form", { class: "cm-form cm-stack-in", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await api("/api/community/threads", { method: "POST", body: { channelId: channel.value, type: type.value, title: title.value, body: text.box.value, as: as ? as.as() : null } });
      busy(form, false);
      if (!r.ok) return say(msg, r.error.message);
      text.clear();
      // A take held for the space's team isn't there to open yet: say so instead.
      if (r.data.held) { form.replaceWith(el("p", { class: "cm-small", role: "status", text: "Thanks. Your take is waiting for the space's team to look at it. You'll see it listed as waiting on the community page." })); return; }
      location.href = r.data.thread.path;
    } } },
      el("h2", { text: "New take" }),
      channels.length > 1 ? el("label", {}, "Channel", channel) : null,
      el("label", {}, "Kind", type),
      el("label", {}, "Title", title),
      as && as.wrap,
      text.wrap,
      el("button", { class: "btn", type: "submit", text: "Post take" }), msg);
    const open = el("button", { class: "btn", type: "button", text: "New take", on: { click: () => { open.remove(); box.append(form); title.focus(); } } });
    box.append(open);
  }

  // A reply form under the take, or under one post (parentId) for a nested reply.
  function replyForm(threadId, { parentId = null, label, preview, who, teamName }) {
    const msg = status();
    const as = asPicker(who, teamName);
    const text = composer({ label, draftKey: `reply:${threadId}:${parentId || "top"}`, preview });
    const form = el("form", { class: "cm-form cm-reply-form cm-stack-in", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await api(`/api/community/threads/${encodeURIComponent(threadId)}/posts`, { method: "POST", body: { body: text.box.value, parentId, as: as ? as.as() : null } });
      if (r.ok && r.data.held) {
        text.clear();
        form.replaceWith(el("p", { class: "cm-small", role: "status", text: "Thanks. Your reply is waiting for the space's team to look at it." }));
        return;
      }
      if (r.ok) {
        text.clear();
        try { sessionStorage.setItem("cm-new-post", r.data.post.id); } catch { /* no animation */ }
        history.replaceState(null, "", r.data.post.path);
        return location.reload();
      }
      busy(form, false);
      say(msg, r.error.message);
    } } }, el("h2", { text: label }), as && as.wrap, text.wrap, el("button", { class: "btn", type: "submit", text: "Post reply" }), msg);
    return form;
  }

  function editForm(post, bar, value, preview) {
    const msg = status();
    const text = composer({ label: "Edit your post", value, preview });
    const form = el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await api(`/api/community/posts/${encodeURIComponent(post.id)}`, { method: "PATCH", body: { body: text.box.value } });
      if (r.ok) return location.reload();
      busy(form, false);
      say(msg, r.error.message);
    } } }, text.wrap, el("button", { class: "btn small", type: "submit", text: "Save" }), msg);
    bar.replaceWith(form);
    text.box.focus();
  }

  async function setupThread(who) {
    tools.hidden = false;
    const preview = who.features.includes("preview");
    const threadId = tools.dataset.cmThread;
    const question = tools.dataset.cmType === "question";
    if (!who.signedIn || !who.emailVerified || !who.member) { gate(tools, who, () => location.reload()); return; }
    const state = await mine();
    if (!state) return;
    const own = new Map(state.ownPosts.map((p) => [p.id, p]));
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      // One toolbar per post, shared with the features' scripts (whichever runs first makes it).
      const bar = post.querySelector("[data-cm-tools]") || el("div", { class: "cm-post-tools", "data-cm-tools": post.id });
      if (state.canReply) {
        bar.append(el("button", { class: "btn ghost small", type: "button", text: "Reply", on: { click: (ev) => {
          const f = replyForm(threadId, { parentId: post.id === tools.dataset.cmOpening ? null : post.id, label: "Your reply", preview, who, teamName: state.teamName });
          ev.currentTarget.disabled = true;
          post.after(f);
          f.querySelector("textarea").focus();
        } } }));
      }
      const mineHere = own.get(post.id);
      if (mineHere) {
        if (Date.now() - Date.parse(mineHere.createdAt) < EDIT_MS) bar.append(el("button", { class: "btn ghost small", type: "button", text: "Edit", on: { click: () => editForm(post, bar, mineHere.body, preview) } }));
        bar.append(el("button", { class: "btn ghost small", type: "button", text: "Delete", on: { click: async (ev) => {
          if (!await window.GS.confirm("Delete this post?")) return;
          ev.currentTarget.disabled = true;
          const r = await api(`/api/community/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
          if (r.ok) return location.reload();
          ev.currentTarget.disabled = false;
          window.GS.toast(r.error.message, true);
        } } }));
      }
      if (bar.childElementCount && !bar.isConnected) post.append(bar);
    });
    if (state.canReply) document.querySelector(".cm-thread-page").append(replyForm(threadId, { label: question ? "Your answer" : "Reply", preview, who, teamName: state.teamName }));
  }

  // A post just written settles in like a block stacking (owner: charm), once.
  function stackIn() {
    let id = null;
    try { id = sessionStorage.getItem("cm-new-post"); sessionStorage.removeItem("cm-new-post"); } catch { /* none */ }
    const post = id && document.getElementById(id);
    if (post && !reduce) post.classList.add("cm-stack-in");
  }

  // The new-take form offers only the channels and kinds this visitor may start (team-only channels and Updates for the
  // space's team and publishers), and says so when that leaves none.
  async function takeFormFor(box, who) {
    const s = (await kit.space()) || {};
    const channels = JSON.parse(box.dataset.cmCompose)
      .map((c) => ({ ...c, types: c.types.filter((t) => t !== "update" || s.mayUpdate) }))
      .filter((c) => c.types.length && (!c.team || s.team || (s.mayUpdate && c.types.includes("update"))));
    if (!channels.length) { box.append(el("p", { class: "cm-small", text: "Only this space's team starts takes here. You can reply to any take." })); return; }
    newTakeForm(box, channels, who, s.team || s.mayUpdate ? s.name : null);
  }

  (async () => {
    stackIn();
    const who = await me();
    const compose = document.querySelector("[data-cm-compose]");
    if (compose) {
      compose.hidden = false;
      gate(compose, who, () => takeFormFor(compose, who));
    }
    if (tools) setupThread(who);
  })();
})();
