// Wires up a project's newsletter sign-up (#newsletter-form). The store mails a confirmation link (double opt-in) and
// adds the address to the project's Brevo list once it is clicked; the link comes back here with ?newsletter=<result>.
// A project can instead point newsletterAction (data/projects.js) at another provider's form. Needs data/site.js and
// js/util.js.
(function () {
  "use strict";

  const { $, api } = window.GS;
  const SITE = window.GS.currentProject(); // the project's own newsletter

  const form = $("#newsletter-form");
  if (!form) return;
  const msg = $("#newsletter-msg");
  if (SITE.newsletterAction) {
    form.action = SITE.newsletterAction;
    form.method = "post";
    return;
  }

  const RESULTS = {
    confirmed: "You're on the list. See you in your inbox.",
    expired: "That link expired. Sign up again for a fresh one.",
    invalid: "That link didn't work. Sign up again for a fresh one.",
    error: "Something went wrong on our side. Try the link again in a minute."
  };
  const result = new URLSearchParams(location.search).get("newsletter");
  if (RESULTS[result]) msg.textContent = RESULTS[result];

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    if (btn.disabled) return;
    btn.disabled = true;
    msg.textContent = "Signing you up…";
    const res = await api("/api/newsletter", { method: "POST", body: { email: form.elements.email.value, project: SITE.id } });
    btn.disabled = false;
    if (res.ok) {
      msg.textContent = "Almost there: check your inbox and click the link to confirm.";
      form.reset();
    } else if (res.status === 503) {
      msg.textContent = "Mailing list is coming soon. Thanks for the interest!";
    } else {
      msg.textContent = res.error.message;
    }
  });
})();
