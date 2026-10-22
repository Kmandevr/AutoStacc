// The Team desk's page in the Studio (/studio?desk=<space id>; owner, 2026-10-22): swaps the Studio's own app for the
// desk host that js/community-kit.js and the community's desk scripts fill (tabs from js/community-desk.js), with a
// way back. Runs before them and before js/studio.js, which then finds no app to draw. The API decides who may see
// anything: anyone but the space's team gets an empty desk and a note. Needs js/util.js.
(function () {
  "use strict";
  const id = new URLSearchParams(location.search).get("desk");
  const root = document.getElementById("studio-app");
  if (!id || !root || !/^[a-z]+_[A-Za-z0-9_-]{1,60}$/.test(id)) return;
  root.removeAttribute("id");
  root.textContent = "";
  const h1 = document.querySelector(".page-hero h1");
  if (h1) { h1.textContent = "Team desk"; h1.dataset.text = "Team desk"; }
  const lede = document.querySelector(".page-hero p");
  if (lede) lede.textContent = "Everything your community space needs from its team: what's waiting, members, the space itself, its rules and the log.";
  const back = document.createElement("p");
  back.innerHTML = '<a href="/studio">Back to the Studio</a>';
  const host = document.createElement("section");
  host.className = "cm-desk cm-desk-full";
  host.dataset.cmSpace = id;
  host.setAttribute("data-cm-desk", "");
  host.setAttribute("aria-label", "Team desk");
  const note = document.createElement("p");
  note.className = "small-print";
  note.textContent = "Only this space's team sees its desk. If nothing appears, you're not on its team, or the community is closed.";
  root.append(back, host, note);
})();
