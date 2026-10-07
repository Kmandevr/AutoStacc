// Hidden terminal easter egg: press ~ (or `) to open a small command line. Needs data/site.js and js/util.js.
// Effects (hail, remix², sound) are requested through events, so this file doesn't depend on the other egg scripts.
(function () {
  "use strict";

  const { $, escapeHTML } = window.GS;
  const SITE = window.SITE || {};
  const emit = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));
  const go = (href) => () => { location.href = href; return "> opening " + href.replace(".html", "") + " ..."; };

  const COMMANDS = {
    help: () =>
      "commands: ls, open <page>, play hail, loop, whoami, about, booking, sound on|off, remix, hail, date, echo, clear, exit",
    ls: () => "home/  music/  shows/  shop/  news/  press/  hail.wav  unfinished_ideas/ (412 files)",
    open: (a) => ({ home: go("home.html"), music: go("home.html#listen"), shows: go("home.html#shows"), shop: go("shop.html"),
      news: go("news.html"), press: go("press.html") }[a] || (() => `open: no such page: ${a || "(nothing)"}. try ls`))(),
    cd: (a) => COMMANDS.open(a.replace(/\/$/, "")),
    play: (a) => (/hail/i.test(a) ? go("home.html#listen")() : "play: try `play hail`"),
    loop: () => "[01] create  [02] finish  [03] extract  [04] stitch  [05] glitch  [06] stitch it all  [07] repeat ↻ 01",
    whoami: () => "guest. or a fragment that hasn't been stitched in yet.",
    about: () => "Glitches & Stitches: unfinished songs are raw material. take broken pieces, stitch them, glitch them, reuse them.",
    booking: () => (SITE.email ? `> ${SITE.email} (or /press)` : "> see /press"),
    sound: (a) => {
      if (a !== "on" && a !== "off") return "usage: sound on|off";
      emit("gs:sound-set", a === "on");
      return `> sound ${a}`;
    },
    remix: () => { emit("gs:egg", "remix"); return "> remixing the remix..."; },
    "remix²": () => COMMANDS.remix(),
    hail: () => { emit("gs:egg", "hail"); return "> incoming."; },
    date: () => new Date().toString(),
    echo: (a) => a,
    sudo: () => "nice try. we'd just stitch it back together.",
    rm: () => "rm: refusing. nothing gets thrown away here, it gets reused.",
    exit: () => { close(); return ""; }
  };

  let box;
  let log;
  let input;
  let opener;

  function print(text, cls = "") {
    log.insertAdjacentHTML("beforeend", `<div class="${cls}">${escapeHTML(text)}</div>`);
    log.scrollTop = log.scrollHeight;
  }

  function run(line) {
    const [cmd = "", ...rest] = line.trim().split(/\s+/);
    print(`guest@autostacc:~$ ${line}`, "cmd");
    if (!cmd) return;
    if (cmd === "clear") { log.textContent = ""; return; }
    const fn = COMMANDS[cmd.toLowerCase()];
    if (!fn) { emit("gs:sound", "error"); print(`command not found: ${cmd}. try help`, "err"); return; }
    emit("gs:sound", "blip");
    const out = fn(rest.join(" "));
    if (out) print(out);
  }

  function build() {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="term" role="dialog" aria-modal="true" aria-label="Terminal" hidden>
        <div class="term-bar"><span>guest@autostacc: ~</span><button type="button" class="term-x" aria-label="Close terminal">[x]</button></div>
        <div class="term-log" aria-live="polite"></div>
        <form class="term-line"><label for="term-in">guest@autostacc:~$</label>
          <input id="term-in" autocomplete="off" autocapitalize="off" spellcheck="false"></form>
      </div>`);
    box = $(".term");
    log = $(".term-log", box);
    input = $("#term-in", box);
    $(".term-x", box).addEventListener("click", close);
    $(".term-line", box).addEventListener("submit", (e) => {
      e.preventDefault();
      run(input.value);
      input.value = "";
    });
    box.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    print("G&S terminal v2. type help. esc to close.", "dim");
  }

  function open() {
    if (!box) build();
    opener = document.activeElement;
    box.hidden = false;
    emit("gs:sound", "open");
    input.focus();
  }

  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    if (opener && opener.focus) opener.focus();
  }

  addEventListener("keydown", (e) => {
    if ((e.key === "~" || e.key === "`") && !e.target.closest("input, textarea, select, [contenteditable]")) {
      e.preventDefault();
      box && !box.hidden ? close() : open();
    }
  });
})();
