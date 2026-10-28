// The community core's forms (docs/community.md, "Look and words"; needs js/community-kit.js): the composer (Write and
// Preview tabs, formatting buttons, drafts kept in this browser), "New take" on spaces and channels, and on a take the
// one-line reply box above the replies (it grows when tapped; "Aa" shows formatting), a quiet Reply under each post
// (nested), Share link for everyone and Edit and Delete on the visitor's own posts (within 24 hours) in each post's ⋯
// menu (js/community-menu.js). Features add their own buttons from their own scripts. The API checks everything again.
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

  // A text box with formatting buttons and, when the preview feature is on, Write / Preview tabs. tucked: the buttons
  // and tabs wait behind a small "Aa" toggle (owner, 2026-10-27: the reply box stays out of the way).
  function composer({ label, value = "", draftKey = null, preview, tucked = false, rows = 6, placeholder = null }) {
    const box = el("textarea", { rows, maxlength: 10000, required: true, "aria-label": label, placeholder });
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
    let aa = null;
    if (tucked) {
      const extras = el("div", { class: "cm-extras", hidden: true }, tabs, bar);
      tabs = null;
      aa = el("button", { type: "button", class: "cm-aa", "aria-expanded": "false", title: "Formatting and preview", text: "Aa", on: { click: () => {
        extras.hidden = !extras.hidden;
        aa.setAttribute("aria-expanded", String(!extras.hidden));
      } } });
      aa.append(el("span", { class: "sr-only", text: " formatting and preview" }));
      const wrap = el("div", { class: "cm-composer" }, extras, box, shown);
      return { wrap, box, aa, clear: () => { box.value = ""; if (draftKey) draft.set(draftKey, ""); } };
    }
    const wrap = el("div", { class: "cm-composer" }, tabs, bar, box, shown);
    return { wrap, box, aa, clear: () => { box.value = ""; if (draftKey) draft.set(draftKey, ""); } };
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

  // The reply box (owner, 2026-10-27, like Reddit): a one-line box that grows on tap into the text box with Cancel and
  // Reply; "Aa" shows the formatting buttons and preview, and "Post as" shows only for a team. Under the take (top) it
  // starts folded; under one post (parentId, a nested reply) it opens ready to type, and Cancel removes it.
  function replyForm(threadId, { parentId = null, label, preview, who, teamName, open = false, onCancel = null }) {
    const msg = status();
    const as = asPicker(who, teamName);
    const text = composer({ label, draftKey: `reply:${threadId}:${parentId || "top"}`, preview, tucked: true, rows: 1, placeholder: parentId ? "Your reply" : `Add ${label.toLowerCase()}…` });
    const cancel = el("button", { class: "cm-act", type: "button", text: "Cancel" });
    const send = el("button", { class: "btn small", type: "submit", text: "Reply" });
    const foot = el("div", { class: "cm-reply-foot" }, text.aa, el("span", { class: "cm-grow" }), cancel, send);
    const form = el("form", { class: "cm-reply-box", "aria-label": label, on: { submit: async (ev) => {
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
    } } }, text.wrap, as && as.wrap, foot, msg);
    const grow = () => { form.classList.add("is-open"); text.box.rows = 4; };
    const fold = () => { form.classList.remove("is-open"); text.box.rows = 1; say(msg, ""); };
    text.box.addEventListener("focus", grow);
    cancel.addEventListener("click", () => {
      if (onCancel) return onCancel(form);
      text.clear();
      fold();
      text.box.blur();
    });
    if (open || text.box.value) grow();
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
    const preview = who.features.includes("preview");
    const threadId = tools.dataset.cmThread;
    const question = tools.dataset.cmType === "question";
    const title = (document.querySelector("h1") || {}).textContent || document.title;
    // Share link, for everyone, in every post's ⋯ menu.
    if (kit.menu && window.GS.communityMenu) document.querySelectorAll("[data-cm-post]").forEach((post) => kit.menu(post).append(window.GS.communityMenu.share(post, title)));
    // Where the reply box goes: under the take, above the replies.
    const spot = document.querySelector(".cm-replies-title");
    const place = (node) => (spot ? spot.before(node) : document.querySelector(".cm-thread-page").append(node));
    if (!who.signedIn || !who.emailVerified || !who.member) {
      const box = el("div", { class: "cm-reply-gate" });
      place(box);
      gate(box, who, () => location.reload());
      return;
    }
    const state = await mine();
    if (!state) return;
    const own = new Map(state.ownPosts.map((p) => [p.id, p]));
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      // The post's action row and ⋯ menu, shared with the features' scripts (kit.row, kit.menu).
      const bar = kit.row(post);
      const opening = post.id === tools.dataset.cmOpening;
      if (state.canReply) {
        // Reply is a quiet text link; on the take itself it jumps to the reply box above the replies.
        const reply = el("button", { class: "cm-act cm-reply-link", type: "button", text: "Reply", on: { click: () => {
          if (opening) { const top = document.querySelector(".cm-reply-box textarea"); if (top) top.focus(); return; }
          reply.disabled = true;
          const f = replyForm(threadId, { parentId: post.id, label: "Your reply", preview, who, teamName: state.teamName, open: true,
            onCancel: (form) => { form.remove(); reply.disabled = false; reply.focus(); } });
          bar.after(f);
          f.querySelector("textarea").focus();
        } } });
        bar.append(reply);
      }
      const mineHere = own.get(post.id);
      if (mineHere) {
        const list = kit.menu(post);
        if (Date.now() - Date.parse(mineHere.createdAt) < EDIT_MS) list.append(el("button", { type: "button", text: "Edit", on: { click: () => editForm(post, bar, mineHere.body, preview) } }));
        list.append(el("button", { type: "button", text: "Delete", on: { click: async (ev) => {
          if (!await window.GS.confirm("Delete this post?")) return;
          ev.currentTarget.disabled = true;
          const r = await api(`/api/community/posts/${encodeURIComponent(post.id)}`, { method: "DELETE" });
          if (r.ok) return location.reload();
          ev.currentTarget.disabled = false;
          window.GS.toast(r.error.message, true);
        } } }));
      }
    });
    if (state.canReply) place(replyForm(threadId, { label: question ? "An answer" : "A reply", preview, who, teamName: state.teamName }));
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
