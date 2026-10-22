// A project's community switch in the Studio (GS.studioCommunity, drawn by js/studio.js; the projectspaces feature,
// server/community/features/projectspaces/): "Community: on / off" for a project, with links to its space and its Team desk. Asks the
// API first and shows nothing when the community isn't open yet (404) or the person may not change it. Needs js/util.js.
(function () {
  "use strict";
  const { escapeHTML: e, api } = window.GS;

  window.GS.studioCommunity = {
    async draw(el, projectId) {
      const path = `/api/community/projects/${encodeURIComponent(projectId)}/space`;
      const r = await api(path);
      if (!r.ok) return;
      let on = r.data.on;
      const space = r.data.space;
      const paint = () => {
        el.innerHTML = `<p class="small-print"><strong>Community</strong> ${on ? "is on for this project." : "is off for this project."}
          ${on && space ? `<a href="${e(el.dataset.address || "")}" data-cm-link>Open it</a> · <a href="/studio?desk=${encodeURIComponent(space.id)}">Team desk</a>` : ""}
          <button class="btn ghost small" type="button">${on ? "Switch off" : "Switch on"}</button></p>
          <p class="small-print">${on ? "Your team runs it: Updates, rules and moderation. Switching it off keeps everything and makes it read-only." : "A place for your followers to ask, answer and talk, run by your team."}</p>`;
        const b = el.querySelector("button");
        b.addEventListener("click", async () => {
          b.disabled = true;
          const res = await api(path, { method: "PUT", body: { on: !on } });
          if (res.ok) { on = res.data.on; paint(); } else { b.disabled = false; window.alert(res.error.message); }
        });
        const a = el.querySelector("[data-cm-link]");
        if (a) a.href = `${el.closest(".studio-project").querySelector(".studio-path").getAttribute("href")}/community`;
      };
      paint();
    }
  };
})();
