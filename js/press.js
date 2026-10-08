// Press page: booking and press-kit buttons and official profiles from the site settings, and copy-to-clipboard for the bios. Needs data/site.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet } = window.GS;
  const SITE = window.GS.currentProject(); // this project's contact, press kit and profiles

  const contact = $("#press-contact");
  if (!contact) return;

  const mail = (subject) => `mailto:${SITE.email}?subject=${encodeURIComponent(`${subject}: ${SITE.name}`)}`;
  contact.innerHTML = [
    SITE.email && `<a class="btn" href="${escapeHTML(mail("Booking"))}">Booking enquiry</a>`,
    SITE.email && `<a class="btn ghost" href="${escapeHTML(mail("Press"))}">Press enquiry</a>`,
    isSet(SITE.pressKitUrl)
      ? `<a class="btn ghost" href="${escapeHTML(SITE.pressKitUrl)}" target="_blank" rel="noopener">Download press kit</a>`
      : `<p class="note">Press photos and logo pack available on request.</p>`,
    !SITE.email && `<p class="note">A booking and press address is on its way.</p>`
  ]
    .filter(Boolean)
    .join("");

  const profiles = $("#press-profiles");
  if (profiles) {
    profiles.innerHTML = (SITE.socials || [])
      .filter((s) => isSet(s.url))
      .map((s) => `<a class="btn ghost" href="${escapeHTML(s.url)}" target="_blank" rel="me noopener">${escapeHTML(s.name)}</a>`)
      .join("");
  }

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
