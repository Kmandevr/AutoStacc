// UI sound: a [SND] switch in the header (off by default, remembered) and small glitchy sounds made in the browser.
// Other scripts ask for a sound with: document.dispatchEvent(new CustomEvent("gs:sound", { detail: "zap" })).
// Needs js/layout.js to have drawn the header.
(function () {
  "use strict";

  const header = document.querySelector(".site-header .wrap");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!header || !AudioCtx) return;

  const KEY = "gs-sound";
  let on = false;
  try { on = localStorage.getItem(KEY) === "on"; } catch { /* storage blocked: stays off */ }
  let ctx = null;
  let out = null;
  let noise = null;

  // Browsers only allow audio after a click or key press, so the engine starts on the first one.
  function start() {
    if (!ctx) {
      ctx = new AudioCtx();
      out = ctx.createGain();
      out.gain.value = 0.09; // quiet on purpose: texture, not a soundtrack
      out.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function env(node, t, peak, len) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    node.connect(g).connect(out);
    return g;
  }
  // A stepped (bit-crushed sounding) square-wave blip.
  function tone(freq, to, len, peak = 1, at = 0) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    for (let i = 1; i <= 4; i++) o.frequency.setValueAtTime(freq + ((to - freq) * i) / 4, t + (len * i) / 5);
    env(o, t, peak, len);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  // A burst of filtered static, optionally chopped into stutters.
  function hiss(len, freq, peak = 1, at = 0, chops = 0) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 0.9;
    const g = env(src.connect(f), t, peak, len);
    for (let i = 1; i < chops; i++) g.gain.setValueAtTime(i % 2 ? 0 : peak * 0.7, t + (len * i) / chops);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }

  const SOUNDS = {
    blip: () => tone(1400, 900, 0.045, 0.5),
    on: () => { tone(500, 500, 0.06, 0.6); tone(1000, 1000, 0.08, 0.6, 0.07); },
    page: () => hiss(0.22, 2400, 1, 0, 6),
    zap: () => { hiss(0.07, 5000, 0.5); tone(2200, 300, 0.06, 0.25); },
    tick: () => hiss(0.012, 6000, 0.35),
    open: () => { tone(300, 900, 0.09, 0.5); hiss(0.05, 4000, 0.4, 0.05); },
    hail: () => { for (let i = 0; i < 26; i++) hiss(0.02, 3000 + Math.random() * 5000, 0.5, Math.random() * 1.4); },
    tear: () => { hiss(0.5, 1200, 1, 0, 10); [880, 660, 440, 220].forEach((f, i) => tone(f, f / 2, 0.08, 0.5, 0.1 * i)); },
    error: () => { tone(220, 110, 0.12, 0.6); tone(165, 82, 0.16, 0.6, 0.13); }
  };

  function play(name) {
    if (!on || !SOUNDS[name]) return;
    start();
    if (ctx.state === "running") SOUNDS[name]();
  }

  // The switch, styled like a terminal flag. Placed before the phone menu button.
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "snd";
  btn.setAttribute("aria-label", "Sound effects");
  const draw = () => {
    btn.textContent = on ? "[SND:ON]" : "[SND:OFF]";
    btn.setAttribute("aria-pressed", String(on));
  };
  draw();
  header.insertBefore(btn, header.querySelector(".nav-toggle"));
  btn.addEventListener("click", () => {
    on = !on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* not remembered */ }
    draw();
    if (on) { start(); SOUNDS.on(); }
  });

  // Wake the engine on the first interaction of each page if sound was left on.
  ["pointerdown", "keydown"].forEach((type) => addEventListener(type, () => on && start(), { once: true, capture: true }));

  // Clicks: a page link gets static (it plays while the page glitches out), anything else a blip.
  addEventListener("click", (e) => {
    const el = e.target.closest("a, button");
    if (!el || el === btn) return;
    const href = el.getAttribute("href") || "";
    play(el.tagName === "A" && !href.startsWith("#") && !el.target ? "page" : "blip");
  });

  document.addEventListener("gs:sound", (e) => play(e.detail));
  document.addEventListener("gs:sound-set", (e) => { if (e.detail !== on) btn.click(); });
})();
