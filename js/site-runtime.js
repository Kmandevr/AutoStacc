// AutoStacc's runtime for creator sites (docs/builder.md): the only script a creator page may load (its CSP names this
// file and nothing else). It reads settings the server wrote into data- attributes from checked values and never runs
// or inserts anything a creator typed: text goes in with textContent. Every piece works without it (all slides scroll,
// every tab shows, plain audio controls, the countdown's date); this only makes them nicer. Pieces: motion as elements
// scroll in, slideshows (arrows, autoplay), tabs, a lightbox for galleries, a countdown, and an audio player that
// draws a live waveform. Respects prefers-reduced-motion. Standalone: needs no other AutoStacc script.
(function () {
  "use strict";

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const make = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    kids.forEach((k) => n.append(k));
    return n;
  };

  function motion() {
    const items = $$("[data-fx]");
    if (!items.length || calm || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("cs-fx-ready");
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("cs-in"); seen.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach((el) => seen.observe(el));
  }

  function slideshows() {
    $$("[data-slides]").forEach((box) => {
      const slides = $$(".cs-slide", box);
      if (slides.length < 2) return;
      const go = (dir) => {
        const i = Math.round(box.scrollLeft / box.clientWidth);
        const next = (i + dir + slides.length) % slides.length;
        box.scrollTo({ left: next * box.clientWidth, behavior: calm ? "auto" : "smooth" });
      };
      const prev = make("button", { type: "button", "aria-label": "Previous slide", text: "‹" });
      const nextBtn = make("button", { type: "button", "aria-label": "Next slide", text: "›" });
      prev.onclick = () => go(-1);
      nextBtn.onclick = () => go(1);
      box.after(make("div", { class: "cs-slide-nav" }, [prev, nextBtn]));
      box.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });
      const seconds = Number(box.dataset.auto);
      if (seconds > 0 && !calm) {
        let paused = false;
        ["mouseenter", "focusin"].forEach((t) => box.addEventListener(t, () => { paused = true; }));
        ["mouseleave", "focusout"].forEach((t) => box.addEventListener(t, () => { paused = false; }));
        setInterval(() => { if (!paused && !document.hidden) go(1); }, Math.max(2, seconds) * 1000);
      }
    });
  }

  let tabCount = 0;
  function tabs() {
    $$("[data-tabs]").forEach((box) => {
      const panels = $$(".cs-tab", box);
      if (panels.length < 2) return;
      const base = `cs-tabs-${++tabCount}`;
      const bar = make("div", { class: "cs-tabbar", role: "tablist" });
      const buttons = panels.map((panel, i) => {
        const title = panel.querySelector("h3");
        const b = make("button", { type: "button", role: "tab", id: `${base}-t${i}`, "aria-controls": `${base}-p${i}`, text: title ? title.textContent : `Tab ${i + 1}` });
        panel.id = `${base}-p${i}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", b.id);
        if (title) title.hidden = true;
        b.onclick = () => select(i);
        b.onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const j = (i + (e.key === "ArrowRight" ? 1 : -1) + panels.length) % panels.length; select(j); buttons[j].focus(); } };
        bar.append(b);
        return b;
      });
      function select(n) {
        buttons.forEach((b, i) => { b.setAttribute("aria-selected", String(i === n)); b.tabIndex = i === n ? 0 : -1; });
        panels.forEach((p, i) => { p.hidden = i !== n; });
      }
      box.prepend(bar);
      select(0);
    });
  }

  function lightbox() {
    const links = $$("a[data-lightbox]");
    if (!links.length) return;
    let open = null;
    const close = () => { if (open) { open.box.remove(); open.from.focus(); open = null; } };
    links.forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const img = a.querySelector("img");
      const shown = make("img", { src: a.getAttribute("href"), alt: img ? img.alt : "" });
      const shut = make("button", { type: "button", text: "Close" });
      // Outside the creator's area (it is contained), so the picture can fill the window.
      const box = make("div", { class: "cs-lightbox", role: "dialog", "aria-modal": "true", "aria-label": img && img.alt ? img.alt : "Picture" }, [shown, shut]);
      box.onclick = (ev) => { if (ev.target === box) close(); };
      shut.onclick = close;
      document.body.append(box);
      open = { box, from: a };
      shut.focus();
    }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function countdowns() {
    const items = $$("[data-countdown]").map((el) => ({ el, at: Date.parse(el.dataset.countdown), out: el.querySelector(".cs-countdown-when") })).filter((x) => x.out && Number.isFinite(x.at));
    if (!items.length) return;
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => items.forEach(({ el, at, out }) => {
      const left = at - Date.now();
      if (left <= 0) { if (el.dataset.done) out.textContent = el.dataset.done; return; }
      const s = Math.floor(left / 1000);
      out.textContent = `${Math.floor(s / 86400)}d ${pad(Math.floor(s / 3600) % 24)}h ${pad(Math.floor(s / 60) % 60)}m ${pad(s % 60)}s`;
    });
    tick();
    setInterval(tick, 1000);
  }

  // A play button, a waveform drawn live from the music as it plays (Web Audio on the page's own <audio>; no network),
  // and a progress line you can click to jump. The browser's own controls stay for keyboards and screen readers.
  function audio() {
    let ctx = null;
    $$("[data-audio]").forEach((fig) => {
      const media = fig.querySelector("audio");
      if (!media || !window.AudioContext) return;
      const canvas = make("canvas", { class: "cs-wave", width: "600", height: "56", "aria-hidden": "true" });
      media.before(canvas);
      const g = canvas.getContext("2d");
      const color = getComputedStyle(fig).getPropertyValue("color") || "#fff";
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || color;
      let analyser = null, data = null;
      const draw = () => {
        const w = canvas.width, h = canvas.height;
        g.clearRect(0, 0, w, h);
        const done = media.duration ? media.currentTime / media.duration : 0;
        g.fillStyle = accent;
        g.globalAlpha = .25;
        g.fillRect(0, h - 3, w, 3);
        g.globalAlpha = 1;
        g.fillRect(0, h - 3, w * done, 3);
        if (analyser && !media.paused) {
          analyser.getByteTimeDomainData(data);
          g.strokeStyle = accent;
          g.lineWidth = 2;
          g.beginPath();
          for (let i = 0; i < data.length; i++) { const x = (i / (data.length - 1)) * w; const y = ((data[i] / 255) * (h - 8)) + 2; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke();
          requestAnimationFrame(draw);
        }
      };
      media.addEventListener("play", () => {
        if (!analyser) {
          try {
            ctx = ctx || new AudioContext();
            const src = ctx.createMediaElementSource(media);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            data = new Uint8Array(analyser.fftSize);
            src.connect(analyser);
            analyser.connect(ctx.destination);
          } catch { analyser = null; }
        }
        if (ctx && ctx.state === "suspended") ctx.resume();
        requestAnimationFrame(draw);
      });
      ["pause", "timeupdate", "loadedmetadata"].forEach((t) => media.addEventListener(t, () => requestAnimationFrame(draw)));
      canvas.addEventListener("click", (e) => {
        if (!media.duration) return;
        const r = canvas.getBoundingClientRect();
        media.currentTime = ((e.clientX - r.left) / r.width) * media.duration;
      });
      draw();
    });
  }

  const start = () => [motion, slideshows, tabs, lightbox, countdowns, audio].forEach((f) => { try { f(); } catch { /* a piece that fails leaves the page as it was */ } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
