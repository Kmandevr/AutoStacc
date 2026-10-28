// Tags (the tags feature, server/community/features/tags/; needs js/community-kit.js and js/tag-input.js): the tags of
// the takes on the page show as small #links beside each (each opens the site's search for that tag); on a take, its
// author (24 hours) or the space's team edits them from the take's ⋯ menu with the tag box (typed freely, suggestions
// from all of AutoStacc, up to 8); on a space's management page, its team keeps a few suggested tags and hides tags in
// the space. Text only through textContent. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press, status, say, busy } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;
  const idOf = (a) => (a.getAttribute("href").match(/\/community\/t\/(thr_[a-z0-9]+)/) || [])[1];
  const link = (t) => el("a", { class: "cm-tag", href: `/search?q=${enc("#" + t.key)}`, text: t.label });

  let current = [];
  async function decorate() {
    const links = [...document.querySelectorAll("a.cm-strip-title")].filter((a) => idOf(a));
    const ids = [...new Set(links.map(idOf))].slice(0, 24);
    const threadId = kit.tools && kit.tools.dataset.cmThread;
    if (threadId) ids.push(threadId);
    if (!ids.length) return;
    const r = await api(`/api/community/tags/for?threads=${ids.map(enc).join(",")}`);
    if (!r.ok) return;
    links.forEach((a) => {
      const tags = r.data.tags[idOf(a)] || [];
      if (tags.length) a.closest(".cm-strip-main").append(el("p", { class: "cm-tags", "aria-label": "Tags" }, tags.map(link)));
    });
    const opening = kit.opening();
    current = (threadId && r.data.tags[threadId]) || [];
    if (opening && current.length) {
      const body = opening.querySelector(".cm-body");
      if (body) body.after(el("p", { class: "cm-tags", "aria-label": "Tags" }, current.map(link)));
    }
  }

  // "Edit tags" in the take's ⋯ menu opens the tag box under the take's action row.
  function editor(state) {
    const opening = kit.opening();
    if (!opening) return;
    const threadId = kit.tools.dataset.cmThread;
    const item = el("button", { type: "button", text: "Edit tags" });
    item.addEventListener("click", () => {
      if (opening.querySelector(".cm-tag-form")) return opening.querySelector(".cm-tag-form input").focus();
      const msg = status();
      const input = el("input", { name: "tags", "data-tag-input": "", "data-max": "8", value: current.map((t) => t.key).join(", "), "aria-label": "Tags",
        "data-extra": JSON.stringify((state.extra || []).map((t) => ({ tag: t }))) });
      const form = el("form", { class: "cm-form cm-tag-form" }, el("label", {}, "Tags (up to 8)", input),
        el("div", { class: "cm-reply-foot" }, el("span", { class: "cm-grow" }),
          el("button", { class: "cm-act", type: "button", text: "Cancel", on: { click: () => form.remove() } }),
          el("button", { class: "btn small", type: "submit", text: "Save tags" })), msg);
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        busy(form, true);
        const res = await api(`/api/community/threads/${enc(threadId)}/tags`, { method: "PUT", body: { tags: input.value.split(/[,\s]+/).filter(Boolean) } });
        busy(form, false);
        if (res.ok) location.reload(); else say(msg, res.error.message);
      });
      kit.row(opening).after(form);
      const box = form.querySelector(".tag-type");
      if (box) box.focus();
    });
    kit.menu(opening).append(item);
  }

  // The team's part of the management page: suggested tags (offered first while typing in the space) and hidden tags.
  async function desk() {
    const spaceId = kit.desk.dataset.cmSpace;
    const r = await api(`/api/community/tags?space=${enc(spaceId)}`);
    if (!r.ok) return;
    const part = kit.deskPart(`Tags (${r.data.space.length} suggested, ${r.data.hidden.length} hidden)`, null, "tags");
    const remove = (path, body) => async (ev) => {
      const b = ev.currentTarget;
      press(b, true);
      const res = await api(path, { method: "DELETE", body });
      press(b, false);
      if (res.ok) location.reload(); else window.GS.toast(res.error.message, true);
    };
    const add = (label, path, key, button) => {
      const msg = status();
      const input = el("input", { required: true, maxlength: 40, "aria-label": label });
      return el("form", { class: "cm-form", on: { submit: async (ev) => {
        ev.preventDefault();
        busy(ev.currentTarget, true);
        const res = await api(path, { method: key === "label" ? "POST" : "PUT", body: { [key]: input.value } });
        busy(ev.currentTarget, false);
        if (res.ok) location.reload(); else say(msg, res.error.message);
      } } }, input, el("button", { class: "btn small", type: "submit", text: button }), msg);
    };
    part.append(el("h3", { text: "Suggested here" }), el("p", { class: "cm-small", text: "Offered first when someone tags a take in this space. Anyone can still type their own." }));
    r.data.space.forEach((t) => part.append(el("p", { class: "cm-desk-row" }, `#${t.key} `,
      el("button", { class: "btn ghost small", type: "button", text: "Remove", on: { click: remove(`/api/community/spaces/${enc(spaceId)}/tags`, { key: t.key }) } }))));
    part.append(add("New suggested tag", `/api/community/spaces/${enc(spaceId)}/tags`, "label", "Add"));
    part.append(el("h3", { text: "Hidden here" }), el("p", { class: "cm-small", text: "A hidden tag stays on its takes but isn't shown or listed in this space." }));
    r.data.hidden.forEach((t) => part.append(el("p", { class: "cm-desk-row" }, `#${t} `,
      el("button", { class: "btn ghost small", type: "button", text: "Show again", on: { click: remove(`/api/community/spaces/${enc(spaceId)}/hidden-tags`, { tag: t }) } }))));
    part.append(add("Tag to hide", `/api/community/spaces/${enc(spaceId)}/hidden-tags`, "tag", "Hide"));
  }

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("tags")) return;
    await decorate();
    if (who.signedIn && who.member && kit.tools) {
      const state = await kit.mine();
      if (state && (state.team || state.ownPosts.some((p) => p.id === kit.tools.dataset.cmOpening))) {
        const spaceId = state.features && state.features.tags && state.features.tags.spaceId;
        const list = spaceId ? await api(`/api/community/tags?space=${enc(spaceId)}`) : null;
        editor({ extra: list && list.ok ? list.data.space.map((t) => t.key) : [] });
      }
    }
    if (who.signedIn && kit.desk) { const s = await kit.space(); if (s && s.team) desk(); }
  })();
})();
