// Easter eggs: type "hail", the Konami code (palette remix), the About monogram, "[signal lost]" tab title,
// a console hello and rotating 404 jokes. Needs js/util.js. Sounds go through the "gs:sound" event (js/sound.js).
(function () {
  "use strict";

  const { $ } = window.GS;
  const root = document.documentElement;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));

  // A small terminal-style message in the corner.
  function toast(html) {
    const old = $(".egg-toast");
    if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", `<div class="egg-toast" role="status">${html}</div>`);
    setTimeout(() => { const t = $(".egg-toast"); if (t) t.remove(); }, 4200);
  }

  // Shared with the hidden terminal (js/terminal.js) through events, so the features stay independent.
  function hail() {
    sound("hail");
    toast(`&gt; HAIL: out now. <a href="${window.GS.projectPath(window.GS.currentProject().id, "music", "hail")}">listen</a>`);
    if (calm) return;
    const storm = document.createElement("div");
    storm.className = "hail";
    storm.setAttribute("aria-hidden", "true");
    const bits = ["▪", "◆", "░", "▓", "·", "▫"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("span");
      s.textContent = bits[i % bits.length];
      s.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 1.2}s;animation-duration:${0.7 + Math.random() * 0.8}s;font-size:${10 + Math.random() * 16}px`;
      storm.append(s);
    }
    document.body.append(storm);
    setTimeout(() => storm.remove(), 3000);
  }

  // remix²: the page tears into slices, then comes back with green and purple swapped (for this visit).
  function remix() {
    sound("tear");
    root.classList.add("tearing");
    setTimeout(() => {
      root.classList.toggle("remixed");
      root.classList.remove("tearing");
      const now = root.classList.contains("remixed");
      try { sessionStorage.setItem("gs-remix", now ? "1" : ""); } catch { /* fine */ }
      toast(now ? "&gt; remix² unlocked. colours stitched the other way round." : "&gt; remix² reverted. back to the original.");
    }, calm ? 0 : 650);
  }
  try { if (sessionStorage.getItem("gs-remix")) root.classList.add("remixed"); } catch { /* fine */ }

  document.addEventListener("gs:egg", (e) => ({ hail, remix }[e.detail] || (() => {}))());

  // Keys: "hail" typed anywhere, or the Konami code. Ignored while typing in a field.
  const KONAMI = "ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a";
  let keys = [];
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
    keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-10);
    if (keys.join(" ").endsWith(KONAMI)) { keys = []; remix(); }
    else if (keys.slice(-4).join("") === "hail") { keys = []; hail(); }
  });

  // The About monogram: five quick clicks and it shatters, then stitches itself back.
  const art = $(".about .art");
  if (art) {
    let clicks = 0;
    let timer;
    art.addEventListener("click", () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => (clicks = 0), 1200);
      sound("zap", art);
      if (clicks < 5) return;
      clicks = 0;
      sound("shatter", art);
      art.classList.add("shatter");
      setTimeout(() => art.classList.remove("shatter"), 1400);
    });
  }

  // Leave the tab and the signal drops.
  const title = document.title;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) document.title = "[signal lost] · Glitches & Stitches · AutoStacc";
    else {
      document.title = "[signal restored]";
      setTimeout(() => (document.title = title), 1200);
    }
  });

  // 404: a different error each time.
  const err = $("#err-msg");
  if (err) {
    const jokes = [
      "ERR 404: fragment not found",
      "ERR 404: this page was sampled into another track",
      "ERR 404: segment corrupted beyond repair (for now)",
      "ERR 404: stitch came loose",
      "ERR 404: buffer underrun, page not loaded"
    ];
    err.textContent = jokes[Math.floor(Math.random() * jokes.length)];
  }

  // For the curious ones with the developer tools open.
  console.log(
    "%c\n  ▄▄▄  ▄  ▄▄▄\n  █ ▄ ▄█▄ ▀▄▄\n  ▀▄▀ ▀█  ▄▄▀  GLITCHES & STITCHES\n",
    "color:#33ff66;font-family:monospace;font-size:14px;text-shadow:0 0 6px #33ff66"
  );
  console.log(
    "%cbuilt from broken pieces. press ~ on the page for a terminal.\nbookings and collabs: see the press page",
    "color:#bf5fff;font-family:monospace"
  );
})();
