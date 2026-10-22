// Tags (the tags feature, server/community/features/tags/; needs js/community-kit.js): the tags of the takes on the page
// show as small buttons beside each (a button lists that tag's takes); on a take, its author (24 hours) or the space's
// team picks up to three from the list; on a space, its team adds and removes its own tags. Text only through
// textContent. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, press, status, say, busy } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;
  const idOf = (a) => (a.getAttribute("href").match(/\/community\/t\/(thr_[a-z0-9]+)/) || [])[1];

  function results(tag) {
    let box = document.querySelector(".cm-tag-results");
    if (!box) { box = el("div", { class: "cm-tag-results", "aria-live": "polite" }); document.querySelector("main").prepend(box); }
    box.replaceChildren(el("p", { class: "cm-small", text: `Takes tagged ${tag.label}:` }));
    api(`/api/community/tagged?tag=${enc(tag.key)}`).then((r) => {
      if (!r.ok) return;
      if (!r.data.results.length) box.append(el("p", { class: "cm-small", text: "None yet." }));
      r.data.results.forEach((x) => box.append(el("p", { class: "cm-small" }, el("a", { href: x.path, text: x.title }), ` · ${x.space}`)));
    });
  }

  async function decorate() {
    const links = [...document.querySelectorAll("a.cm-strip-title, h1 a")].filter((a) => idOf(a));
    const ids = [...new Set(links.map(idOf))].slice(0, 25);
    const threadId = kit.tools && kit.tools.dataset.cmThread;
    if (threadId && !ids.includes(threadId)) ids.push(threadId);
    if (!ids.length) return;
    const r = await api(`/api/community/tags/for?threads=${ids.map(enc).join(",")}`);
    if (!r.ok) return;
    const chip = (t) => el("button", { class: "cm-tag", type: "button", text: t.label, on: { click: () => results(t) } });
    links.forEach((a) => (r.data.tags[idOf(a)] || []).forEach((t) => a.closest("li, .cm-strip-main").append(chip(t))));
    if (threadId && kit.tools) {
      const row = el("div", { class: "cm-tags", role: "group", "aria-label": "Tags" }, (r.data.tags[threadId] || []).map(chip));
      kit.tools.before(row);
    }
  }

  async function picker(state) {
    const threadId = kit.tools.dataset.cmThread;
    const spaceId = state.features.tags && state.features.tags.spaceId;
    const r = await api(`/api/community/tags${spaceId ? `?space=${enc(spaceId)}` : ""}`);
    const have = await api(`/api/community/tags/for?threads=${enc(threadId)}`);
    if (!r.ok || !have.ok) return;
    const all = [...r.data.space, ...r.data.starter];
    const chosen = new Set((have.data.tags[threadId] || []).map((t) => t.key));
    const sel = el("select", { multiple: true, size: 6, "aria-label": "Tags (up to three)" }, all.map((t) => { const o = el("option", { value: t.key, text: t.label }); o.selected = chosen.has(t.key); return o; }));
    const msg = status();
    const form = el("form", { class: "cm-form" }, el("details", {}, el("summary", { text: "Set tags" }), sel,
      el("button", { class: "btn small", type: "submit", text: "Save tags" }), msg));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const res = await api(`/api/community/threads/${enc(threadId)}/tags`, { method: "PUT", body: { tags: [...sel.selectedOptions].map((o) => o.value) } });
      busy(form, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    });
    kit.tools.hidden = false;
    kit.tools.append(form);
  }

  async function desk() {
    const spaceId = kit.desk.dataset.cmSpace;
    const r = await api(`/api/community/tags?space=${enc(spaceId)}`);
    if (!r.ok) return;
    const part = kit.deskPart(`Space tags (${r.data.space.length})`);
    r.data.space.forEach((t) => part.append(el("p", { class: "cm-desk-row" }, `${t.label} `, el("button", { class: "btn ghost small", type: "button", text: "Remove", on: { click: async (ev) => {
      const b = ev.currentTarget;
      press(b, true);
      const res = await api(`/api/community/spaces/${enc(spaceId)}/tags`, { method: "DELETE", body: { key: t.key } });
      press(b, false);
      if (res.ok) location.reload(); else window.alert(res.error.message);
    } } }))));
    const msg = status();
    const label = el("input", { required: true, maxlength: 30, "aria-label": "New tag" });
    part.append(el("form", { class: "cm-form", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(ev.currentTarget, true);
      const res = await api(`/api/community/spaces/${enc(spaceId)}/tags`, { method: "POST", body: { label: label.value } });
      busy(ev.currentTarget, false);
      if (res.ok) location.reload(); else say(msg, res.error.message);
    } } }, label, el("button", { class: "btn small", type: "submit", text: "Add tag" }), msg));
  }

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("tags")) return;
    decorate();
    if (who.signedIn && who.member && kit.tools) {
      const state = await kit.mine();
      if (state && (state.team || state.ownPosts.some((p) => p.id === kit.tools.dataset.cmOpening))) picker(state);
    }
    if (who.signedIn && kit.desk) { const s = await kit.space(); if (s && s.team) desk(); }
  })();
})();
