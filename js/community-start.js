// Starting a community, on the community's front page (the spaces feature; owner, 2026-10-27): anyone signed in with
// a username can start one, no creator needed. Only the name is needed; a description, rules and channels have
// defaults and can be changed later on the space's management page, where the founder lands. Also lists the spaces
// the visitor helps run, with links to manage them. The API checks everything. Needs js/community-kit.js.
(function () {
  "use strict";
  const GS = window.GS;
  const K = GS && GS.communityKit;
  const box = document.querySelector("[data-cm-start]");
  if (!K || !box) return;
  const { el, status, say, busy } = K;

  function form(info) {
    const msg = status();
    const name = el("input", { name: "name", required: true, minlength: 3, maxlength: 30, autocomplete: "off" });
    const description = el("textarea", { name: "description", rows: 2, maxlength: 500 });
    const rules = el("textarea", { name: "rules", rows: 3, maxlength: 4000, placeholder: "Optional. AutoStacc's community rules apply everywhere already." });
    const channels = el("input", { name: "channels", value: info.defaults.channels.join(", "), maxlength: 400 });
    const f = el("form", { class: "cm-form cm-stack-in", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(f, true);
      const list = channels.value.split(",").map((c) => c.trim()).filter(Boolean);
      const r = await GS.api("/api/community/spaces", { method: "POST", body: { name: name.value, description: description.value, rules: rules.value, channels: list } });
      if (!r.ok) { busy(f, false); return say(msg, r.error.message); }
      location.href = r.data.space.manage;
    } } },
      el("label", {}, "Name", name, el("span", { class: "cm-small", text: "3 to 30 letters or numbers. It becomes the address and can't be changed." })),
      el("label", {}, "What it's about (optional)", description),
      el("details", { class: "cm-more" }, el("summary", { text: "More setup (optional)" }),
        el("label", {}, "Your rules", rules),
        el("label", {}, "Channels, separated by commas", channels)),
      el("p", { class: "cm-small", text: "You can change all of this later. Your community is labelled Unofficial and follows the community rules." }),
      el("div", { class: "cm-actions" }, el("button", { class: "btn", type: "submit", text: "Start it" }),
        el("button", { class: "btn ghost", type: "button", text: "Cancel", on: { click: () => { f.remove(); open.hidden = false; } } })), msg);
    return f;
  }

  let open = null;
  async function draw() {
    const who = await K.me();
    if (!(who.features || []).includes("spaces")) return;
    const r = await GS.api("/api/community/start");
    if (!r.ok) return;
    const info = r.data;
    box.hidden = false;
    box.append(el("h2", { class: "cm-aside-title", text: "Start a community" }),
      el("p", { class: "cm-small", text: "A space for a genre, a tool or a scene, run by you. No creator page needed." }));
    if (!info.signedIn) return box.append(el("p", { class: "cm-small" }, el("a", { href: GS.loginPath ? GS.loginPath() : "/login", text: "Log in" }), " to start one."));
    if (info.member && info.left === 0) {
      return box.append(el("p", { class: "cm-small", text: info.cap ? `You run ${info.owned} communities, the most one account can start. Archive one to start another.` : "New communities can't be started right now." }));
    }
    open = el("button", { class: "btn small", type: "button", text: "Start a community" });
    const slot = el("div");
    open.addEventListener("click", () => {
      open.hidden = true;
      K.gate(slot, { ...who, emailVerified: info.emailVerified, member: who.member }, () => slot.append(form(info)));
    });
    box.append(open, slot);
  }

  // The spaces the visitor runs or moderates, with a way to manage each.
  async function runs() {
    const who = await K.me();
    if (!who.signedIn || !(who.features || []).includes("spaces")) return;
    const r = await GS.api("/api/community/my-spaces");
    if (!r.ok || !r.data.spaces.length) return;
    box.hidden = false;
    box.prepend(el("div", { class: "cm-runs" }, el("h2", { class: "cm-aside-title", text: "Spaces you help run" }),
      el("ul", {}, r.data.spaces.map((s) => el("li", {}, el("a", { href: s.path, text: s.name }), " · ", el("a", { href: s.manage, text: "Manage" }))))));
  }

  draw();
  runs();
})();
