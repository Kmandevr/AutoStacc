// The home page's backdrop ([data-daw-stage]): a DAW arrange view drawn in code. Track lanes with clips (waveforms and
// MIDI notes in AutoStacc's track colours), a bar ruler, the arrangement scrolling past a playhead, and mixer meters.
// Purely decorative (aria-hidden). It is fixed behind the page, and the hero (data-daw-hero, the element the page
// gives) sits over it. It stops moving once the hero is scrolled away (nothing to watch, nothing to repaint), and never
// moves for visitors who ask for less motion (css/daw-stage.css). The same seed draws the same song every time.
// Needs nothing.
(function () {
  "use strict";

  const stage = document.querySelector("[data-daw-stage]");
  if (!stage) return;

  // A small seeded random, so the arrangement is the same on every visit.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = (min, max) => min + Math.floor(rand() * (max - min + 1));

  const BARS = 32, BAR = 96, LANE = 64; // LANE: the drawing box of a clip; the lanes stretch to fill the screen (CSS)
  const LANES = [["Drums", "samples", "wave"], ["Bass", "midi", "notes"], ["Chords", "presets", "notes"], ["Loops", "loops", "wave"],
    ["Lead", "midi", "notes"], ["Vocal chops", "samples", "wave"], ["FX", "teal", "wave"], ["Stems", "presets", "wave"]];

  // A clip's picture: a mirrored waveform, or MIDI notes, in a w x h box.
  function wave(w, h) {
    const n = Math.max(8, Math.floor(w / 4)), mid = h / 2;
    const amp = Array.from({ length: n }, (_, i) => (0.25 + 0.75 * Math.abs(Math.sin(i * 0.7 + rand() * 2))) * (h * 0.42) * (0.6 + rand() * 0.4));
    const top = amp.map((a, i) => `${((i / (n - 1)) * w).toFixed(1)},${(mid - a).toFixed(1)}`);
    const bottom = amp.map((a, i) => `${((i / (n - 1)) * w).toFixed(1)},${(mid + a).toFixed(1)}`).reverse();
    return `<polygon points="${top.concat(bottom).join(" ")}"/>`;
  }
  function notes(w, h) {
    let out = "", x = 2;
    while (x < w - 6) {
      const len = pick(6, 22), y = pick(2, Math.floor(h / 5) - 1) * 5;
      out += `<rect x="${x}" y="${y}" width="${Math.min(len, w - x - 2)}" height="4" rx="1.5"/>`;
      x += len + pick(1, 8);
    }
    return out;
  }

  // One pass of the song: the ruler and every lane's clips. Drawn twice side by side, so the scroll loops seamlessly.
  function song() {
    const ruler = Array.from({ length: BARS }, (_, i) => `<span style="left:${i * BAR}px">${i + 1}</span>`).join("");
    const lanes = LANES.map(([, track, kind], li) => {
      let bar = pick(0, 3), clips = "";
      while (bar < BARS) {
        const len = Math.min(BARS - bar, pick(2, li < 2 ? 8 : 5)), w = len * BAR - 4, h = LANE - 22;
        clips += `<div class="daw-clip" data-track="${track}" style="left:${bar * BAR + 2}px;width:${w}px">
          <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">${kind === "wave" ? wave(w, h) : notes(w, h)}</svg></div>`;
        bar += len + pick(0, li % 3 === 0 ? 1 : 3);
      }
      return `<div class="daw-lane">${clips}</div>`;
    }).join("");
    return `<div class="daw-pass" style="width:${BARS * BAR}px"><div class="daw-ruler">${ruler}</div>${lanes}</div>`;
  }
  const once = song();

  stage.style.setProperty("--daw-loop", `${BARS * BAR}px`);
  stage.innerHTML = `
    <div class="daw-top"><span class="daw-dot"></span><span class="daw-play"></span><span class="daw-label">Arrange</span><span class="daw-label">4/4</span></div>
    <div class="daw-body">
      <div class="daw-heads"><div class="daw-ruler-gap"></div>${LANES.map(([name, track]) => `<div class="daw-head" data-track="${track}"><i></i>${name}</div>`).join("")}</div>
      <div class="daw-view"><div class="daw-strip">${once}${once}</div><div class="daw-playhead"></div></div>
      <div class="daw-mixer">${LANES.map(([, track], i) => `<div class="daw-meter" data-track="${track}" style="--beat:${(0.5 + (i % 4) * 0.17).toFixed(2)}s;--late:${(i * 0.13).toFixed(2)}s"><i></i></div>`).join("")}
        <div class="daw-meter daw-master" style="--beat:.46s;--late:0s"><i></i></div></div>
    </div>
    <div class="daw-shade"></div>`;

  // Still once the hero is out of view; moving again when it comes back.
  const hero = document.querySelector("[data-daw-hero]");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => stage.classList.toggle("is-still", !entry.isIntersecting)).observe(hero);
  }
})();
