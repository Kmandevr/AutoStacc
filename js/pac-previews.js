// Pac editor: the Pac's preview clips (owner, 2026-10-15): up to three short clips customers can play on the product
// page and in Your Stacc. Each is uploaded (MP3, M4A, OGG or WAV) or picked from one of the Pac's own audio files: the
// browser decodes the creator's original (their own download, server/packs/originals.js), keeps its first 30 seconds,
// fades the end and sends that as a WAV (about 5 MB); the store keeps only the clip (server/packs/previews.js).
// GS.pacPreviews.mount(box, { url, base, version: () => the version shown or null }). Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;
  const SECONDS = 30, RATE = 44100;
  // Cutting decodes the whole file in the browser's memory: past this, upload a clip instead (a phone can run out).
  const CUT_MAX = 200 * 1024 * 1024;
  const AUDIO = /\.(wav|wave|aif|aiff|flac|mp3|ogg|oga|m4a)$/i;

  // 16-bit PCM WAV of an AudioBuffer.
  function wavOf(buf) {
    const ch = buf.numberOfChannels, n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (at, s) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
    str(0, "RIFF"); out.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * ch * 2, true);
    const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    for (let i = 0, at = 44; i < n; i++) for (let c = 0; c < ch; c++, at += 2) out.setInt16(at, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true);
    return new Blob([out.buffer], { type: "audio/wav" });
  }

  // The first SECONDS of an audio file, faded out over its last half second, as a WAV.
  async function cut(bytes) {
    const ctx = new OfflineAudioContext(2, SECONDS * RATE, RATE);
    const decoded = await ctx.decodeAudioData(bytes);
    const len = Math.min(decoded.length, SECONDS * RATE);
    const clip = new AudioBuffer({ numberOfChannels: Math.min(2, decoded.numberOfChannels), length: len, sampleRate: RATE });
    const fade = Math.min(len, RATE / 2);
    for (let c = 0; c < clip.numberOfChannels; c++) {
      const d = decoded.getChannelData(c).slice(0, len);
      for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
      clip.copyToChannel(d, c);
    }
    return wavOf(clip);
  }

  function mount(box, opts) {
    if (!box || !(window.FEATURES && window.FEATURES["packs.editor"])) return;
    const say = (t, error) => { const m = $("[data-pp-status]", box); if (m) { m.textContent = t; m.classList.toggle("error", Boolean(error)); } };

    async function draw(note, error) {
      const res = await api(opts.url);
      if (!res.ok) { box.innerHTML = ""; return; }
      const { previews, max } = res.data;
      const v = opts.version();
      const audio = v && v.files ? v.files.filter((f) => AUDIO.test(f.filename)) : [];
      box.innerHTML = `<section class="panel pp" aria-labelledby="pp-h"><h3 id="pp-h">Previews</h3>
        <p class="small-print">Up to ${max} short clips anyone can play on the product page and in Your Stacc. A clip is public as soon as it's saved, even before you publish. A clip picked from your files is its first ${SECONDS} seconds.</p>
        <ul class="plain pp-list">${previews.map((p) => `<li><span>${e(p.title || "Preview")}</span><audio controls preload="none" src="${e(p.url)}"></audio>
          <button class="link-btn" type="button" data-pp-remove="${e(p.id)}" aria-label="Remove preview ${e(p.title || `${previews.indexOf(p) + 1}`)}">Remove</button></li>`).join("")}</ul>
        ${previews.length < max ? `<div class="pp-add">
          <div class="field"><label for="pp-title">Title (optional)</label><input id="pp-title" maxlength="80" data-pp-title></div>
          <button class="btn ghost small" type="button" data-pp-choose>Upload a clip</button><input type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.ogg,.wav" hidden data-pp-upload>
          ${audio.length ? `<div class="field"><label for="pp-pick">Or cut one from (files up to ${CUT_MAX / 1048576} MB)</label><select id="pp-pick" data-pp-pick><option value="">Choose a file…</option>
            ${audio.map((f) => `<option value="${e(f.assetId)}">${e(f.folderPath ? `${f.folderPath}/` : "")}${e(f.filename)}</option>`).join("")}</select></div>` : ""}
        </div>` : ""}
        <p class="msg" role="status" data-pp-status></p></section>`;
      if (note) say(note, error);
    }

    let busy = false;
    async function send(blob, filename, asset) {
      if (busy) return;
      busy = true;
      box.querySelectorAll("[data-pp-choose], [data-pp-pick]").forEach((x) => (x.disabled = true));
      try { await upload(blob, filename, asset); } finally { busy = false; }
    }
    async function upload(blob, filename, asset) {
      const title = ($("[data-pp-title]", box) || {}).value || "";
      say("Uploading the clip…");
      const q = `?filename=${encodeURIComponent(filename)}&title=${encodeURIComponent(title)}${asset ? `&asset=${encodeURIComponent(asset)}` : ""}`;
      const res = await fetch(opts.url + q, { method: "POST", credentials: "same-origin", body: blob, headers: { "Content-Type": blob.type || "audio/wav" } }).catch(() => null);
      const out = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) return draw((out.error && out.error.message) || "That clip didn't upload. Try again.", true);
      draw("Preview added.");
    }

    box.onchange = async (ev) => {
      const up = ev.target.closest("[data-pp-upload]");
      if (up && up.files[0]) return send(up.files[0], up.files[0].name, null);
      const pick = ev.target.closest("[data-pp-pick]");
      if (!pick || !pick.value) return;
      const v = opts.version();
      const f = v && v.files.find((x) => x.assetId === pick.value);
      if (f && f.sizeBytes > CUT_MAX) {
        pick.value = "";
        return say(`That file is too big to cut here (over ${CUT_MAX / 1048576} MB). Upload a short clip instead.`, true);
      }
      pick.disabled = true;
      say("Cutting the first 30 seconds…");
      try {
        const r = await fetch(`${opts.base}/versions/${encodeURIComponent(v.id)}/files/${encodeURIComponent(pick.value)}`, { credentials: "same-origin" });
        if (!r.ok) throw new Error("Couldn't read that file.");
        await send(await cut(await r.arrayBuffer()), "clip.wav", pick.value);
      } catch (err) {
        pick.disabled = false;
        say(err.message && !/decode/i.test(err.message) ? err.message : "Your browser can't play that file to cut a clip. Upload a clip instead.", true);
      }
    };

    box.onclick = async (ev) => {
      if (ev.target.closest("[data-pp-choose]")) return $("[data-pp-upload]", box).click();
      const rm = ev.target.closest("[data-pp-remove]");
      if (!rm || !await window.GS.confirm("Remove this preview?")) return;
      rm.disabled = true;
      const res = await api(`${opts.url}/${encodeURIComponent(rm.dataset.ppRemove)}`, { method: "DELETE" });
      if (!res.ok) { rm.disabled = false; return say(res.error.message, true); }
      draw("Preview removed.");
    };

    box.refresh = () => draw();
    draw();
  }

  window.GS.pacPreviews = { mount, cut };
})();
