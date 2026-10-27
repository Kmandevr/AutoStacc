// Shared helpers for the community's browser scripts (GS.communityKit; loads before js/community.js and each
// js/community-<feature>.js): building elements safely (text only through textContent), status lines, the visitor
// (/api/community/me, asked once), their state in the open take or space (/mine, asked once), the space team's desk
// (js/community-desk.js; each feature adds its own part, with a placeholder until it's ready), request
// buttons with a spinner, and the "join" gate. No feature logic lives here, so each feature script stays independent.
(function () {
  "use strict";
  const GS = window.GS;
  if (!GS || !document.querySelector("[data-cm-compose], [data-cm-thread], [data-cm-space], [data-cm-notices], [data-cm-bar]")) return;

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
  // A username picked at sign-up joins first (GS.pendingUsername), so the page then shows the visitor as a member.
  const me = () => (mePromise = mePromise || (GS.pendingUsername ? GS.pendingUsername.apply() : Promise.resolve())
    .then(() => GS.api("/api/community/me")).then((r) => (r.ok ? r.data : { signedIn: false, features: [] })));
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
  // The team desk (js/community-desk.js): tabs on the space's management page, a slim link on the space's page. Features add their parts
  // with a key that gives each its fixed place; without the desk module, parts are drawn nowhere.
  const D = desk && GS.communityDesk ? GS.communityDesk.make(desk, el, sk, space) : null;
  // The management page's note ("only the team...") stays only for people who aren't on the team.
  const deskNote = document.querySelector("[data-cm-desk-note]");
  if (deskNote) space().then((d) => { if (d && d.team) deskNote.hidden = true; else if (desk) desk.hidden = true; });
  const deskWait = (key) => (D ? D.wait(key) : el("div"));
  const deskPart = (title, wait = null, key = "") => (D ? D.part(title, wait, key) : el("section"));
  const deskFull = Boolean(D && D.full);
  const notices = document.querySelector("[data-cm-notices]");

  // A button that calls the API, disables itself (with a spinner) until the answer, and runs done(data) on success.
  const action = (label, { path, method, body, pressed = null, cls = "btn ghost small", title = null, done }) => {
    const b = el("button", { class: cls, type: "button", text: label, title, "aria-pressed": pressed === null ? false : String(pressed) });
    b.addEventListener("click", async () => {
      press(b, true);
      const r = await GS.api(typeof path === "function" ? path() : path, { method: typeof method === "function" ? method() : method, body });
      press(b, false);
      if (r.ok) return done ? done(r.data, b) : location.reload();
      window.GS.toast(r.error.message, true);
    });
    return b;
  };

  // Signed out, unconfirmed or without a username: what's needed, in place of the form. then() runs once the
  // visitor can post.
  function gate(box, who, then) {
    if (!who.signedIn) {
      box.append(el("p", { class: "cm-small" }, el("a", { href: GS.loginPath ? GS.loginPath() : "/login", text: "Log in" }), " to post, boost and reply."));
      return;
    }
    if (!who.emailVerified) { box.append(el("p", { class: "cm-small", text: "Confirm your email address to take part." })); return; }
    if (who.member) { then(); return; }
    const msg = status();
    const name = el("input", { name: "displayName", required: true, minlength: 3, maxlength: 30, autocomplete: "username" });
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
      el("p", { class: "cm-small", text: "Pick a username: the name people see on your posts (never your email). You can change it later in Settings. AutoStacc's and creators' names are kept for their owners, so pick your own here: if you're on a project's team, you'll post as the project by choosing it under \"Post as\"." }),
      el("label", {}, "Username", name),
      el("label", { class: "cm-check" }, age, " I'm 16 or older, and I'll follow the ", el("a", { href: "/community-rules", text: "community rules" }), "."),
      el("button", { class: "btn", type: "submit", text: "Join and continue" }), msg);
    box.append(form);
  }

  // "Post as": your own username, the space's name for its team, and the names you may speak for anywhere (AutoStacc
  // for its admins, projects whose team you're on; who.identities from /api/community/me). The server checks it.
  // Returns null when there's nothing to choose; as() is what the form sends (null for your own name).
  const asPicker = (who, teamName) => {
    const opts = [];
    if (teamName) opts.push(["space", `${teamName} (Team)`]);
    (who.identities || []).filter((x) => x.name !== teamName).forEach((x) => opts.push([x.id, `${x.name} (Team)`]));
    if (!opts.length) return null;
    const sel = el("select", { name: "as" }, el("option", { value: "", text: who.member ? who.member.displayName : "Me" }), opts.map(([v, t]) => el("option", { value: v, text: t })));
    return { wrap: el("label", {}, "Post as", sel), as: () => sel.value || null };
  };

  // The toolbar's panels (server: barHook): panel(key, label) gives the one { button, box } for that key, made on first
  // ask, so two features can share a panel (the inbox and mention alerts share "Notifications") without knowing each
  // other. Opening one closes the others; Escape or a click outside closes it. The box gets "gs:cm-open" when opened.
  const bar = document.querySelector("[data-cm-bar]");
  const barTools = bar && bar.querySelector("[data-cm-bar-tools]");
  const panels = {};
  const closeAll = (except) => Object.values(panels).forEach((x) => { if (x !== except) { x.box.hidden = true; x.button.setAttribute("aria-expanded", "false"); } });
  const panel = (key, label) => {
    if (!barTools) return null;
    if (panels[key]) return panels[key];
    const id = `cm-panel-${key}`;
    const button = el("button", { class: "btn ghost small cm-bar-button", type: "button", "aria-expanded": "false", "aria-controls": id, "data-panel": key, text: label });
    const box = el("div", { class: "cm-bar-panel", id, hidden: true });
    button.addEventListener("click", () => {
      const open = box.hidden;
      closeAll();
      box.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      if (open) box.dispatchEvent(new Event("gs:cm-open"));
    });
    barTools.append(el("div", { class: "cm-bar-item", "data-panel": key }, button, box));
    return (panels[key] = { button, box });
  };
  if (barTools) {
    document.addEventListener("click", (ev) => { if (!ev.target.closest(".cm-bar-item")) closeAll(); });
    document.addEventListener("keydown", (ev) => {
      const open = Object.values(panels).find((x) => !x.box.hidden);
      if (ev.key === "Escape" && open) { closeAll(); open.button.focus(); }
    });
  }

  GS.communityKit = { bar, panel, asPicker, deskFull, el, status, say, busy, press, me, mine, action, gate, tools, desk, space, deskWait, deskPart, notices };
})();
