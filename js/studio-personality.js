// A project's card personality in the Studio (GS.studioPersonality, drawn by js/studio.js; server/projects/personality.js):
// the accent colour and the small animation its cards on AutoStacc use, from presets, with a live sample. "Automatic"
// follows the project's own look. Shows nothing when the person may not change it. Needs js/util.js.
(function () {
  "use strict";
  const { escapeHTML: e, api } = window.GS;
  const NAMES = { auto: "Automatic", teal: "Teal", amber: "Amber", coral: "Coral", lime: "Lime", violet: "Violet", pulse: "Pulse", glitch: "Glitch", wave: "Wave", none: "None" };

  window.GS.studioPersonality = {
    async draw(el, projectId) {
      const path = `/api/studio/projects/${encodeURIComponent(projectId)}/personality`;
      const r = await api(path);
      if (!r.ok) return;
      const opts = (list, cur) => list.map((v) => `<option value="${e(v)}"${v === cur ? " selected" : ""}>${e(NAMES[v] || v)}</option>`).join("");
      el.innerHTML = `<form class="studio-personality">
          <p class="small-print"><strong>On AutoStacc's cards</strong> your project keeps AutoStacc's look and adds its own accent and a small animation.</p>
          <div class="field"><label for="pp-accent-${e(projectId)}">Accent</label><select id="pp-accent-${e(projectId)}" name="accent">${opts(r.data.accents, r.data.accent)}</select></div>
          <div class="field"><label for="pp-motion-${e(projectId)}">Animation</label><select id="pp-motion-${e(projectId)}" name="motion">${opts(r.data.motions, r.data.motion)}</select></div>
          <button class="btn ghost small" type="submit">Save</button>
          <p class="msg" role="status" hidden></p>
        </form>`;
      const form = el.querySelector("form");
      const msg = el.querySelector(".msg");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const b = form.querySelector("button");
        b.disabled = true;
        const res = await api(path, { method: "PUT", body: { accent: form.accent.value, motion: form.motion.value } });
        b.disabled = false;
        msg.hidden = false;
        msg.className = res.ok ? "msg" : "msg error";
        msg.textContent = res.ok ? "Saved. Your cards show it the next time they load." : res.error.message;
      });
    }
  };
})();
