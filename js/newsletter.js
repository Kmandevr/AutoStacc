// Wires up the newsletter signup form on the home page. Needs data/site.js and js/util.js.
(function () {
  "use strict";

  const { $ } = window.GS;
  const SITE = window.SITE || {};

  const form = $("#newsletter-form");
  if (!form) return;
  const msg = $("#newsletter-msg");
  if (SITE.newsletterAction) {
    form.action = SITE.newsletterAction;
    form.method = "post";
    return;
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    msg.textContent = "Mailing list is coming soon. Thanks for the interest!";
    form.reset();
  });
})();
