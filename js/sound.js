// UI sound: a [SND] switch in the header (off by default, remembered) and soft, musical glitch sounds made in the browser.
// Every note comes from one scale, so overlapping sounds stay in key, and each sound follows the timing of its animation.
// Other scripts ask for a sound with: document.dispatchEvent(new CustomEvent("gs:sound", { detail: "zap" })),
// or { detail: { name: "word", n: 2, el } } to pass a step number and the element (for left/right placement).
// Needs js/layout.js to have drawn the header; the switch goes at the end of the nav (inside the menu on phones).
(function () {
  "use strict";

  const nav = document.querySelector(".site-header .nav");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!nav || !AudioCtx) return;

  const KEY = "gs-sound";
  let on = false;
  try { on = localStorage.getItem(KEY) === "on"; } catch { /* storage blocked: stays off */ }
  let ctx, bus, echo, noise, crush;

  // A minor pentatonic, A4 upwards: anything played together harmonises.
  const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const note = (i) => SCALE[Math.max(0, Math.min(SCALE.length - 1, i))];
  const wobble = () => 1 + (Math.random() - 0.5) * 0.006; // tiny detune so repeats don't sound robotic

  // Browsers only allow audio after a click or key press, so the engine is built on the first one.
  function start() {
    if (!ctx) {
      ctx = new AudioCtx();
      const limit = ctx.createDynamicsCompressor(); // keeps stacked sounds from getting loud
      limit.threshold.value = -18;
      limit.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = 0.32;
      limit.connect(master).connect(ctx.destination);
      // Tape-style saturation on the whole mix: rounds peaks off and adds gritty harmonics.
      const drive = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3) / Math.tanh(3);
      drive.curve = curve;
      drive.oversample = "2x";
      drive.connect(limit);
      bus = ctx.createGain();
      bus.gain.value = 0.55; // the saturation adds level, so feed it less
      bus.connect(drive);
      // A soft, darkened echo for space.
      echo = ctx.createDelay(1);
      echo.delayTime.value = 0.19;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2200;
      echo.connect(tone).connect(fb).connect(echo);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      tone.connect(wet).connect(drive);
      // Bit-crush: quantise the wave to very few levels for the glitch grit.
      crush = new Float32Array(256);
      for (let i = 0; i < 256; i++) crush[i] = Math.round(((i / 255) * 2 - 1) * 3) / 3;
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  // Output stage for one sound: volume envelope, stutter chops, left/right placement, bit-crush grit and echo.
  function voice(src, t, { peak = 1, len = 0.2, pan = 0, grit = 0.3, chop = 0, space = 0.5 } = {}) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    // Stutter: cut the sound in and out a few times, like a skipping buffer.
    const gate = ctx.createGain();
    const seg = len / (chop * 2 + 1);
    for (let i = 0; i < chop; i++) {
      gate.gain.setValueAtTime(0, t + seg * (2 * i + 1));
      gate.gain.setValueAtTime(1, t + seg * (2 * i + 1.6));
    }
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    if (grit) {
      const ws = ctx.createWaveShaper();
      ws.curve = crush;
      const mix = ctx.createGain();
      mix.gain.value = Math.min(1, grit);
      src.connect(ws).connect(mix).connect(g);
    }
    src.connect(g).connect(gate).connect(p).connect(bus);
    const send = ctx.createGain();
    send.gain.value = space;
    p.connect(send).connect(echo);
  }
  // A bell-like note with bite: triangle body, a quiet buzzing square underneath, a crackle on the attack.
  function pluck(freq, at = 0, opts = {}) {
    const t = ctx.currentTime + at;
    const len = opts.len || 0.3;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq * wobble();
    const buzz = ctx.createOscillator();
    buzz.type = "square";
    buzz.frequency.value = freq * wobble();
    const buzzLevel = ctx.createGain();
    buzzLevel.gain.value = 0.18;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(4500, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + len);
    o.connect(f);
    buzz.connect(buzzLevel).connect(f);
    voice(f, t, { peak: 0.6, len: 0.3, ...opts });
    hiss(at, { freq: 7000, len: 0.008, peak: 0.1 + (opts.grit || 0.3) * 0.15, pan: opts.pan || 0, space: 0.05 });
    [o, buzz].forEach((osc) => { osc.start(t); osc.stop(t + len + 0.05); });
  }
  // A short slice of filtered static.
  function hiss(at = 0, { freq = 3000, len = 0.04, peak = 0.35, pan = 0, space = 0.15, grit = 0, chop = 0 } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq * (0.85 + Math.random() * 0.3);
    f.Q.value = 1.4;
    src.connect(f);
    voice(f, t, { peak, len, pan, space, grit, chop });
    src.start(t, Math.random() * 0.8);
    src.stop(t + len + 0.02);
  }

  // Each sound follows its animation's frames (see css/base.css and css/eggs.css).
  const SOUNDS = {
    // clicks: a note whose pitch follows where you clicked; now and then it skips
    blip: ({ x }) => pluck(note(2 + Math.round((x + 1) * 2)), 0, { len: 0.18, peak: 0.45, pan: x, grit: 0.4, chop: Math.random() < 0.3 ? 1 : 0 }),
    // switching sound on: the chant as a motif, one note per word; "Repeat" stutters
    on: () => [0, 1, 2, 3, 5].forEach((n, i) => pluck(note(n), i * 0.11, { len: i === 4 ? 0.8 : 0.3, peak: 0.42, space: 0.7, chop: i === 4 ? 3 : 0 })),
    // leaving a page: three crushed static slices on the three page-out frames, falling in pitch
    page: ({ x }) => [0, 0.053, 0.107].forEach((at, i) => { hiss(at, { freq: 4200 - i * 1100, len: 0.05, pan: x, grit: 0.7 }); pluck(note(5 - i * 2), at, { len: 0.12, peak: 0.28, pan: x, grit: 0.8 }); }),
    // glitch zap: three crackles on the three jitter frames
    zap: ({ x }) => [0, 0.105, 0.21].forEach((at, i) => hiss(at, { freq: 5000 - i * 900, len: 0.04, peak: 0.32, pan: x - 0.2 + i * 0.2, grit: 0.9 })),
    // a section title flickering on: two pings on the flicker's bright frames
    reveal: ({ x }) => [0.075, 0.225].forEach((at, i) => pluck(note(4 + i), at, { len: 0.2, peak: 0.18, pan: x, grit: 0.55, space: 0.7 })),
    // typing: crunchy key clicks
    tick: () => hiss(0, { freq: 5200, len: 0.014, peak: 0.09, space: 0.05, grit: 0.7 }),
    // each word of "Tear. Stitch. Glitch. Cinch. Repeat." lands on the next note up; "Repeat" stutters
    word: ({ n }) => pluck(note([0, 1, 2, 3, 5][n] ?? 5), 0, { len: n === 4 ? 0.7 : 0.35, peak: 0.4, space: 0.8, chop: n === 4 ? 3 : 0 }),
    // terminal opening: arpeggio up with a crackle
    open: () => { [0, 2, 4, 5].forEach((n, i) => pluck(note(n), i * 0.045, { len: 0.25, peak: 0.35, grit: 0.5 })); hiss(0.18, { len: 0.05, grit: 0.8 }); },
    // hail: pentatonic raindrops on glass, a little crunchy
    hail: () => { for (let i = 0; i < 22; i++) pluck(note(3 + Math.floor(Math.random() * 6)), Math.random() * 1.4, { len: 0.22, peak: 0.22, pan: Math.random() * 1.6 - 0.8, space: 0.8, grit: 0.45 }); },
    // Konami tear: crushed static on the six tear frames, notes falling, then a chord when the colours swap
    tear: () => {
      [0, 0.097, 0.195, 0.292, 0.39, 0.52].forEach((at, i) => { hiss(at, { freq: 2500 + i * 400, len: 0.06, pan: i % 2 ? 0.6 : -0.6, grit: 0.85 }); pluck(note(8 - i), at, { len: 0.1, peak: 0.28, grit: 0.9 }); });
      [0, 2, 4].forEach((n) => pluck(note(n), 0.66, { len: 0.9, peak: 0.3, space: 0.9, grit: 0.4 }));
    },
    // monogram: cracks apart (stuttering), pops at 0.39s, snaps back at 0.78s, settles at 1.3s
    shatter: () => { hiss(0, { freq: 1800, len: 0.25, peak: 0.45, grit: 0.9, chop: 3 }); pluck(note(1), 0.39, { len: 0.15, grit: 0.9 }); pluck(note(3), 0.78, { len: 0.2, grit: 0.5 }); pluck(note(5), 1.3, { len: 0.6, space: 0.9 }); },
    // terminal: unknown command, a crushed and stuttering low buzz
    error: () => { pluck(note(0) / 2, 0, { len: 0.2, peak: 0.32, grit: 0.9, chop: 1 }); pluck((note(0) / 2) * 1.06, 0.12, { len: 0.25, peak: 0.3, grit: 0.9, chop: 1 }); }
  };

  const panOf = (el) => {
    if (!el || !el.getBoundingClientRect) return 0;
    const r = el.getBoundingClientRect();
    return ((r.left + r.width / 2) / innerWidth) * 2 - 1;
  };

  function play(detail) {
    const d = typeof detail === "string" ? { name: detail } : detail || {};
    if (!on || !SOUNDS[d.name]) return;
    start();
    if (ctx.state === "running") SOUNDS[d.name]({ x: d.x ?? panOf(d.el), n: d.n ?? 0 });
  }

  // The switch, styled like a terminal flag, at the end of the nav.
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "snd";
  btn.setAttribute("aria-label", "Sound effects");
  const draw = () => {
    btn.textContent = on ? "[SND:ON]" : "[SND:OFF]";
    btn.setAttribute("aria-pressed", String(on));
  };
  draw();
  nav.append(btn);
  btn.addEventListener("click", () => {
    on = !on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* not remembered */ }
    draw();
    if (on) { start(); SOUNDS.on(); }
  });

  // Wake the engine on the first interaction of each page if sound was left on.
  ["pointerdown", "keydown"].forEach((type) => addEventListener(type, () => on && start(), { once: true, capture: true }));

  // Clicks: a page link gets the page-out static, anything else a note placed where you clicked.
  addEventListener("click", (e) => {
    const el = e.target.closest("a, button");
    if (!el || el === btn) return;
    const href = el.getAttribute("href") || "";
    const x = e.clientX ? (e.clientX / innerWidth) * 2 - 1 : panOf(el);
    play({ name: el.tagName === "A" && !href.startsWith("#") && !el.target ? "page" : "blip", x });
  });

  document.addEventListener("gs:sound", (e) => play(e.detail));
  document.addEventListener("gs:sound-set", (e) => { if (e.detail !== on) btn.click(); });
})();
