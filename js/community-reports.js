// Reporting and the team's report queue (the reports feature, server/community/features/reports/; needs
// js/community-kit.js). On a take, members get Report on every post that isn't theirs: a reason and a short note,
// sent to the space's team or to AutoStacc depending on the reason. On a space, its team desk lists the open reports,
// danger first, with Remove (upheld) and Keep (dismissed), and a placeholder while it loads. Does nothing when the feature is off.
(function () {
  "use strict";
  const kit = window.GS && window.GS.communityKit;
  if (!kit) return;
  const { el, status, say, busy, press } = kit;
  const api = window.GS.api;
  const enc = encodeURIComponent;
  const REASONS = [
    ["rules", "Breaks this space's rules"], ["harassment", "Harassment or hate"], ["danger", "Someone may be in danger"],
    ["spam", "Spam or a scam"], ["illegal", "Illegal content"], ["copyright", "Copyright (formal notices: the copyright page)"],
    ["impersonation", "Pretending to be someone else"], ["underage", "Someone under 16"]
  ];
  const LABEL = Object.fromEntries(REASONS);

  function reportForm(targetType, targetId, holder) {
    const reason = el("select", { required: true, "aria-label": "Reason" }, el("option", { value: "", text: "Pick a reason" }),
      REASONS.map(([v, t]) => el("option", { value: v, text: t })));
    const note = el("textarea", { rows: 3, maxlength: 1000, required: true, "aria-label": "What's wrong" });
    const msg = status();
    const form = el("form", { class: "cm-form cm-report cm-stack-in", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await api("/api/community/reports", { method: "POST", body: { targetType, targetId, reason: reason.value, note: note.value } });
      busy(form, false);
      if (!r.ok) return say(msg, r.error.message);
      form.replaceWith(el("p", { class: "cm-small", role: "status",
        text: r.data.route === "autostacc" ? "Thanks. AutoStacc will look at it." : "Thanks. The space's team will look at it." }));
    } } },
    el("label", {}, "Why are you reporting this?", reason),
    el("label", {}, "What's wrong, in a sentence", note),
    el("p", { class: "cm-small" }, "If someone is in immediate danger, call your local emergency number. ", el("a", { href: "/copyright", text: "Copyright notices" }), " have their own form."),
    el("button", { class: "btn small", type: "submit", text: "Send report" }), msg);
    holder.after(form);
    reason.focus();
  }

  function postButtons(state) {
    const own = new Set(state.ownPosts.map((p) => p.id));
    const threadId = kit.tools.dataset.cmThread;
    document.querySelectorAll("[data-cm-post]").forEach((post) => {
      if (own.has(post.id)) return;
      const opening = post.id === kit.tools.dataset.cmOpening;
      const tools = post.querySelector("[data-cm-tools]") || post.appendChild(el("div", { class: "cm-post-tools", "data-cm-tools": post.id }));
      const b = el("button", { class: "btn ghost small cm-report-btn", type: "button", text: "Report", on: { click: () => {
        if (!post.querySelector(".cm-report")) reportForm(opening ? "thread" : "post", opening ? threadId : post.id, tools);
      } } });
      tools.append(b);
    });
  }

  async function queue() {
    const spaceId = kit.desk.dataset.cmSpace;
    const wait = kit.deskWait("reports");
    const r = await api(`/api/community/spaces/${enc(spaceId)}/reports`);
    if (!r.ok) { wait.remove(); return; }
    const part = kit.deskPart(`Reports (${r.data.reports.length})`, wait, "reports");
    if (r.data.reports.some((x) => x.danger)) part.open = true;
    if (!r.data.reports.length) part.append(el("p", { class: "cm-small", text: "No open reports. Nice and quiet." }));
    r.data.reports.forEach((x) => {
      const counts = {};
      x.reasons.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
      const decide = (outcome, ask) => el("button", { class: "btn ghost small", type: "button", text: outcome === "upheld" ? "Remove" : "Keep", on: { click: async (ev) => {
        const reason = ask ? window.prompt(ask) : "";
        if (reason === null) return;
        const btn = ev.currentTarget;
        press(btn, true);
        const res = await api("/api/community/reports/resolve", { method: "POST", body: { targetType: x.type, targetId: x.id, outcome, reason } });
        press(btn, false);
        if (res.ok) location.reload(); else window.GS.toast(res.error.message, true);
      } } });
      part.append(el("article", { class: `cm-desk-item${x.danger ? " cm-danger" : ""}` },
        el("p", { class: "cm-meta" }, x.danger ? el("span", { class: "cm-badge cm-badge-danger", text: "Danger" }) : "", " ",
          el("a", { href: `/community/t/${enc(x.threadId)}${x.type === "post" ? "#" + enc(x.id) : ""}`, text: x.title }),
          ` · ${x.author || "deleted user"}${x.state === "hidden" ? " · hidden for now" : ""}`),
        el("blockquote", { text: x.excerpt }),
        el("p", { class: "cm-small", text: Object.entries(counts).map(([k, n]) => `${LABEL[k] || k} ×${n}`).join(", ") }),
        el("ul", { class: "cm-small" }, x.notes.map((n) => el("li", { text: n }))),
        el("div", { class: "cm-post-tools" }, decide("upheld", "Why remove it under the space's rules? The author is told."), decide("dismissed", null))));
    });
  }

  (async () => {
    const who = await kit.me();
    if (!who.features.includes("reports") || !who.signedIn) return;
    if (kit.tools && who.member) {
      const state = await kit.mine();
      if (state && state.signedIn) postButtons(state);
    }
    if (kit.desk) {
      const s = await kit.space();
      if (s && s.team) queue();
    }
  })();
})();
