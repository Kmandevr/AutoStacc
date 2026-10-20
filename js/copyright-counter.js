// Counter-notices (copyright-notice.html?counter=<notice id>; server/copyright/counter.js): for the signed-in
// account whose upload a notice took down. Shows what was taken down and the counter-notice form in place of the
// notice form, or what's already happening. Needs js/util.js.
(function () {
  "use strict";
  const form = document.querySelector("[data-copyright-counter]");
  const id = new URLSearchParams(location.search).get("counter");
  if (!form || !id || !window.GS) return;
  const notice = document.querySelector("[data-copyright-notice]");
  const msg = form.querySelector(".msg");
  const about = form.querySelector("[data-counter-about]");
  const say = (text, ok) => { msg.textContent = text; msg.className = ok ? "msg" : "msg error"; msg.hidden = false; msg.scrollIntoView({ block: "nearest" }); };
  const line = (text) => { const p = document.createElement("p"); p.textContent = text; return p; };
  if (notice) notice.hidden = true;
  form.hidden = false;

  (async () => {
    const res = await window.GS.api(`/api/copyright/notices/${encodeURIComponent(id)}/mine`);
    if (!res.ok) {
      form.querySelectorAll("input, textarea, button").forEach((x) => { x.disabled = true; });
      return say(res.status === 401 ? "Log in with the account that uploaded it, then open this link again." : res.error.message);
    }
    const n = res.data.notice;
    about.append(line(`The work the notice names: ${n.work}`), line(`Where: ${n.location}`));
    if (res.data.counter) {
      form.querySelectorAll("input, textarea, button").forEach((x) => { x.disabled = true; });
      const s = res.data.counter;
      say(s.status === "waiting" ? `Your counter-notice was sent. Unless the person who sent the notice goes to court, it comes back on ${s.restoreAfter.slice(0, 10)}.`
        : s.status === "restored" ? "Your counter-notice worked: it's back, and the strike has ended." : "The person who sent the notice says they've gone to court, so it stays down for now.", true);
    }
  })();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const missing = [...form.querySelectorAll("[required]")].find((el) => (el.type === "checkbox" ? !el.checked : !String(el.value).trim()));
    if (missing) { missing.focus(); return say("Fill in every part, including both statements and your signature."); }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const res = await window.GS.api(`/api/copyright/notices/${encodeURIComponent(id)}/counter`, { method: "POST", body: {
      name: f.get("name"), email: f.get("email"), address: f.get("address"), mistake: f.get("mistake") === "on", jurisdiction: f.get("jurisdiction") === "on", signature: f.get("signature") } });
    if (!res.ok) { button.disabled = false; return say(res.error.message); }
    form.querySelectorAll("input, textarea, button").forEach((x) => { x.disabled = true; });
    say(`Sent. Unless the person who sent the notice goes to court, it comes back on ${res.data.restoreAfter.slice(0, 10)}.`, true);
  });
})();
