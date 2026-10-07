// Press page: booking and press-kit buttons from the site settings, and copy-to-clipboard for the bios. Needs data/site.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet } = window.GS;
  const SITE = window.SITE || {};

  const contact = $("#press-contact");
  if (!contact) return;

  const mail = (subject) => `mailto:${SITE.email}?subject=${encodeURIComponent(`${subject}: ${SITE.artist}`)}`;
  contact.innerHTML = [
    SITE.email && `<a class="btn" href="${escapeHTML(mail("Booking"))}">Booking enquiry</a>`,
    SITE.email && `<a class="btn ghost" href="${escapeHTML(mail("Press"))}">Press enquiry</a>`,
    isSet(SITE.pressKitUrl)
      ? `<a class="btn ghost" href="${escapeHTML(SITE.pressKitUrl)}" target="_blank" rel="noopener">Download press kit</a>`
      : `<p class="note">Press photos and logo pack available on request.</p>`
  ]
    .filter(Boolean)
    .join("");

  // Copy buttons put the bio text on the clipboard for promoters and press.
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = $("#" + btn.dataset.copy).innerText.trim();
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Select and copy";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1800);
    });
  });
})();
