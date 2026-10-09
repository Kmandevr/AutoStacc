// Press: a drop-in for any [data-press-contact] element (booking and press buttons and the press kit of a project,
// data/projects.js; data-project picks it, default the open project's), and copy-to-clipboard for bios on the page
// ([data-copy="<id of the text>"]). Official profiles are js/profiles.js. Needs data/projects.js and js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, isSet, moduleProject, wear } = window.GS;
  const PROJECTS = window.PROJECTS || [];

  document.querySelectorAll("[data-press-contact]").forEach((contact) => {
    const id = moduleProject(contact);
    const SITE = PROJECTS.find((p) => p.id === id) || {}; // this project's contact and press kit
    const mail = (subject) => `mailto:${SITE.email}?subject=${encodeURIComponent(`${subject}: ${SITE.name}`)}`;
    wear(contact, id);
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
  });

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
