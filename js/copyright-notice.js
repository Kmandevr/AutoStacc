// The copyright notice form (copyright-notice.html; server/copyright/filing.js): checks the required parts in the
// browser for a quick answer, sends the notice and says what happens next. The server checks everything again.
// Needs js/util.js.
(function () {
  "use strict";
  const form = document.querySelector("[data-copyright-notice]");
  if (!form || !window.GS) return;
  const msg = form.querySelector(".msg");
  const say = (text, ok) => { msg.textContent = text; msg.className = ok ? "msg" : "msg error"; msg.hidden = false; msg.scrollIntoView({ block: "nearest" }); };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const missing = [...form.querySelectorAll("[required]")].find((el) => (el.type === "checkbox" ? !el.checked : !String(el.value).trim()));
    if (missing) { missing.focus(); return say("Fill in every part of the notice, including both statements and your signature."); }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const res = await window.GS.api("/api/copyright/notices", { method: "POST", body: {
      claimantName: f.get("claimantName"), claimantEmail: f.get("claimantEmail"), claimantAddress: f.get("claimantAddress"), role: f.get("role"),
      work: f.get("work"), location: f.get("location"), goodFaith: f.get("goodFaith") === "on", accurate: f.get("accurate") === "on",
      signature: f.get("signature"), website: f.get("website")
    } });
    button.disabled = false;
    if (!res.ok) return say(res.error.message);
    form.reset();
    say("Thank you. Your notice has reached AutoStacc. We'll look at it and email you about what we decide.", true);
  });
})();
