// Shared helpers for the community's browser scripts (GS.communityKit; loads before js/community.js and each
// js/community-<feature>.js): building elements safely (text only through textContent), status lines, the visitor
// (/api/community/me, asked once), their state in the open take or space (/mine, asked once), the space team's desk
// (each feature adds its own part) and the "join" gate. No
// feature logic lives here, so each feature script stays independent of the others.
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
  const busy = (form, on) => form.querySelectorAll("button, input, textarea, select").forEach((x) => { x.disabled = on; });

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
  // A titled part of the team desk, shown once a feature has something in it.
  const deskPart = (title) => {
    desk.hidden = false;
    if (!desk.querySelector(".cm-desk-title")) desk.prepend(el("h2", { class: "cm-desk-title", text: "Team desk" }));
    return desk.appendChild(el("details", { class: "cm-desk-part" }, el("summary", { text: title })));
  };
  const notices = document.querySelector("[data-cm-notices]");

  // A button that calls the API, disables itself until the answer, and runs done(data) on success.
  const action = (label, { path, method, body, pressed = null, cls = "btn ghost small", title = null, done }) => {
    const b = el("button", { class: cls, type: "button", text: label, title, "aria-pressed": pressed === null ? false : String(pressed) });
    b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await GS.api(typeof path === "function" ? path() : path, { method: typeof method === "function" ? method() : method, body });
      b.disabled = false;
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
      el("h2", { text: "Join the community" }),
      el("p", { class: "cm-small", text: "Pick the name people will see on your posts. It's chosen once, and it's never your email." }),
      el("label", {}, "Community name", name),
      el("label", { class: "cm-check" }, age, " I'm 16 or older, and I'll follow the ", el("a", { href: "/community-rules", text: "community rules" }), "."),
      el("button", { class: "btn", type: "submit", text: "Join" }), msg);
    box.append(form);
  }

  GS.communityKit = { el, status, say, busy, me, mine, action, gate, tools, desk, space, deskPart, notices };
})();
