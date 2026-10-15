// Pac editor: plays one of a version's audio files in the builder (js/pac-editor.js), one at a time across redraws:
// the creator's own original, streamed from the store. Each card's play button ([data-pe-play]) says whether it plays
// (aria-pressed); a redraw marks the playing one again (sync). GS.pacPlayer.toggle(button, src, onError), sync(box),
// stop(). Needs js/util.js.
(function () {
  "use strict";

  const PLAY = "▶︎", PAUSE = "❚❚︎";
  let audio = null, playing = null; // the src now playing

  const mark = (b, on) => { b.setAttribute("aria-pressed", String(on)); b.textContent = on ? PAUSE : PLAY; };
  const buttons = () => document.querySelectorAll("[data-pe-play]");

  function stop() {
    if (audio) audio.pause();
    playing = null;
    buttons().forEach((b) => mark(b, false));
  }

  function toggle(btn, src, onError) {
    const again = playing === src;
    stop();
    if (again) return;
    audio = audio || new Audio();
    audio.onended = stop;
    audio.src = src;
    playing = src;
    btn.dataset.src = src;
    mark(btn, true);
    audio.play().catch(() => { stop(); onError(); });
  }

  // After a redraw: the card of what's playing shows it.
  function sync(box, srcOf) {
    box.querySelectorAll("[data-pe-play]").forEach((b) => mark(b, playing !== null && srcOf(b.dataset.pePlay) === playing));
  }

  window.GS.pacPlayer = { toggle, sync, stop, PLAY };
})();
