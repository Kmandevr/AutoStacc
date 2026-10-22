// Shared helpers for the community's browser scripts (GS.communityKit; loads before js/community.js and each
// js/community-<feature>.js): building elements safely (text only through textContent), status lines, the visitor
// (/api/community/me, asked once), their state in the open take or space (/mine, asked once), the space team's desk
// (each feature adds its own part, with a loading placeholder until it's ready; GS.skeleton when loaded), request
// buttons with a spinner, and the "join" gate. No feature logic lives here, so each feature script stays independent.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS || !document.querySelector("[data-cm-compose], [data-cm-thread], [data-cm-space], [data-cm-notices]")) return;

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") n.textContent = v;
      else if (k === "on") Object.entries(v).forEach(([e, f]) => n.addEventListener(e, f));
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((k) => k != null && k !== false && n.append(k));
    return n;
  };
  const status = () => el("p", { class: "msg", role: "status", hidden: true });
  const say = (box, msg, ok = false) => { box.textContent = msg; box.className = ok ? "msg" : "msg error"; box.hidden = !msg; };
  // Loading placeholders and button spinners come from GS.skeleton (js/skeleton.js); without it, plain disabling.
  const sk = () => window.GS.skeleton;
  const press = (b, on) => { if (sk()) sk().busy(b, on); else b.disabled = on; };
  const busy = (form, on) => {
    form.querySelectorAll("button, input, textarea, select").forEach((x) => { x.disabled = on; });
    const send = form.querySelector("[type=submit]");
    if (send && sk()) sk().busy(send, on);
  };

  let mePromise = null;
  const me = () => (mePromise = mePromise || GS.api("/api/community/me").then((r) => (r.ok ? r.data : { signedIn: false, features: [] })));
  const tools = document.querySelector("[data-cm-thread]");
  let minePromise = null;
  const mine = () => (minePromise = minePromise || (tools
    ? GS.api(`/api/community/threads/${encodeURIComponent(tools.dataset.cmThread)}/mine`).then((r) => (r.ok ? r.data : null))
    : Promise.resolve(null)));

  const desk = document.querySelector("[data-cm-space]");
  let spacePromise = null;
  const space = () => (spacePromise = spacePromise || (desk
    ? GS.api(`/api/community/spaces/${encodeURIComponent(desk.dataset.cmSpace)}/mine`).then((r) => (r.ok ? r.data : null))
    : Promise.resolve(null)));
  const deskOpen = () => {
    desk.hidden = false;
    if (!desk.querySelector(".cm-desk-title")) desk.prepend(el("h2", { class: "cm-desk-title", text: "Team desk" }));
  };
  // A placeholder in the slot a desk part will take while its list loads (busy for screen readers); the feature
  // hands it to deskPart() when the list is in, or removes it when the list can't load.
  const deskWait = () => {
    deskOpen();
    const w = desk.appendChild(el("div", { class: "cm-desk-part" }));
    if (sk()) sk().show(w, "line", 1);
    return w;
  };
  // A titled part of the team desk, shown once a feature has something in it, in its placeholder's place if it had one.
  const deskPart = (title, wait = null) => {
    deskOpen();
    const part = el("details", { class: "cm-desk-part" }, el("summary", { text: title }));
    if (wait && wait.parentNode) wait.replaceWith(part); else desk.appendChild(part);
    return part;
  };
  const notices = document.querySelector("[data-cm-notices]");

  // A button that calls the API, disables itself (with a spinner) until the answer, and runs done(data) on success.
  const action = (label, { path, method, body, pressed = null, cls = "btn ghost small", title = null, done }) => {
    const b = el("button", { class: cls, type: "button", text: label, title, "aria-pressed": pressed === null ? false : String(pressed) });
    b.addEventListener("click", async () => {
      press(b, true);
      const r = await GS.api(typeof path === "function" ? path() : path, { method: typeof method === "function" ? method() : method, body });
      press(b, false);
      if (r.ok) return done ? done(r.data, b) : location.reload();
      window.alert(r.error.message);
    });
    return b;
  };

  // Signed out, unconfirmed or without a community name: what's needed, in place of the form. then() runs once the
  // visitor can post.
  function gate(box, who, then) {
    if (!who.signedIn) {
      box.append(el("p", { class: "cm-small" }, el("a", { href: GS.loginPath ? GS.loginPath() : "/login", text: "Log in" }), " to post, boost and reply."));
      return;
    }
    if (!who.emailVerified) { box.append(el("p", { class: "cm-small", text: "Confirm your email address to take part." })); return; }
    if (who.member) { then(); return; }
    const msg = status();
    const name = el("input", { name: "displayName", required: true, minlength: 3, maxlength: 30, autocomplete: "nickname" });
    const age = el("input", { type: "checkbox", name: "age", required: true });
    const form = el("form", { class: "cm-form cm-stack-in", on: { submit: async (ev) => {
      ev.preventDefault();
      busy(form, true);
      const r = await GS.api("/api/community/me", { method: "PUT", body: { displayName: name.value, ageConfirmed: age.checked } });
      busy(form, false);
      if (!r.ok) return say(msg, r.error.message);
      form.remove();
      who.member = r.data.member;
      then();
    } } },
      el("h2", { text: "One step before your first post" }),
      el("p", { class: "cm-small", text: "Pick the name people will see on your posts. You do this once, and it's never your email. AutoStacc and creators' names are kept: a space's team posts under those with \"Post as\" once joined." }),
      el("label", {}, "Community name", name),
      el("label", { class: "cm-check" }, age, " I'm 16 or older, and I'll follow the ", el("a", { href: "/community-rules", text: "community rules" }), "."),
      el("button", { class: "btn", type: "submit", text: "Join and continue" }), msg);
    box.append(form);
  }

  // "Post as": for a space's team, a choice between their own community name and the space's (the server checks it).
  // Returns null for everyone else; asTeam() is what the form sends.
  const asPicker = (who, teamName) => {
    if (!teamName) return null;
    const sel = el("select", { name: "as" }, el("option", { value: "me", text: who.member ? who.member.displayName : "Me" }), el("option", { value: "team", text: `${teamName} (Team)` }));
    return { wrap: el("label", {}, "Post as", sel), asTeam: () => sel.value === "team" };
  };

  GS.communityKit = { asPicker, el, status, say, busy, press, me, mine, action, gate, tools, desk, space, deskWait, deskPart, notices };
})();
