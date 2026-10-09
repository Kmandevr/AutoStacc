// Studio product form, "Store details" (GS.studioDetails, for js/studio-products.js): the store's controlled fields for
// one product (genre, contents, formats, DAW, key... only those that apply to its kind), BPM, sample rate and bit depth,
// and values the product's own words suggest (shown to accept, never applied on their own). The server checks every
// value again (server/discovery/vocabulary.js). Needs js/util.js and data/vocabulary.js.
(function () {
  "use strict";

  const GS = window.GS;
  const { escapeHTML: e } = GS;
  const V = window.VOCABULARY || { facets: {}, schemas: {}, specs: {}, bpm: { min: 40, max: 250 } };
  const schemaOf = (type) => V.schemas[type] || V.schemas.other || { facets: [], bpm: false, specs: [] };

  // checked: { facet: [values] }; suggestions: the same shape, values not chosen yet.
  function fields(type, p = {}, prefix = "new") {
    const s = schemaOf(type);
    const chosen = p.facets || {};
    const sug = p.suggestions || {};
    const sugList = Object.entries(sug).flatMap(([f, vs]) => vs.filter((v) => V.facets[f] && s.facets.includes(f)).map((v) => [f, v]));
    const groups = s.facets.map((facet) => {
      const f = V.facets[facet];
      const on = chosen[facet] || [];
      return `<fieldset class="sd-group"><legend>${e(f.label)}${f.multi ? "" : " (pick one)"}${on.length ? ` · ${on.length}` : ""}</legend><div class="sd-values">
        ${Object.entries(f.values).map(([v, text]) => `<label for="sd-${e(prefix)}-${e(facet)}-${e(v)}"><input type="checkbox" id="sd-${e(prefix)}-${e(facet)}-${e(v)}"
          data-sd="${e(facet)}" value="${e(v)}"${on.includes(v) ? " checked" : ""}${f.multi ? "" : " data-single"}> ${e(text)}</label>`).join("")}
      </div></fieldset>`;
    }).join("");
    const bpm = s.bpm ? `<div class="studio-two">
        <div class="field"><label>BPM from<input name="bpm_min" type="number" inputmode="numeric" min="${V.bpm.min}" max="${V.bpm.max}" value="${p.bpm ? p.bpm[0] : ""}"></label></div>
        <div class="field"><label>BPM to<input name="bpm_max" type="number" inputmode="numeric" min="${V.bpm.min}" max="${V.bpm.max}" value="${p.bpm ? p.bpm[1] : ""}"></label></div>
      </div>` : "";
    const specs = s.specs.map((k) => `<div class="field"><label>${e(V.specs[k].label)}<select name="spec_${e(k)}"><option value="">Not stated</option>
      ${V.specs[k].values.map((x) => `<option value="${x}"${(p.specs || {})[k] === x ? " selected" : ""}>${k === "sampleRate" ? `${x / 1000} kHz` : `${x}-bit`}</option>`).join("")}</select></label></div>`).join("");
    return `<details class="studio-details" data-details>
      <summary>Store details <span class="small-print">(genre, contents, formats, compatibility: how buyers find it)</span></summary>
      <p class="small-print">Pick only what is true of the files. Buyers filter the store by these, so a wrong one costs trust.</p>
      ${sugList.length ? `<p class="sd-suggest">Your description mentions: ${sugList.map(([f, v]) => `<button type="button" class="chip" data-sd-add="${e(f)}" data-v="${e(v)}">+ ${e(V.facets[f].values[v])}</button>`).join(" ")}</p>` : ""}
      ${groups}${bpm}${specs ? `<div class="studio-two">${specs}</div>` : ""}
    </details>`;
  }

  // What the form says, for the API: { facets, bpm, specs } (empty lists clear a field).
  function read(form, type) {
    const s = schemaOf(type);
    const facets = {};
    for (const facet of s.facets) facets[facet] = [...form.querySelectorAll(`[data-sd="${facet}"]:checked`)].map((x) => x.value);
    const lo = form.bpm_min && form.bpm_min.value, hi = form.bpm_max && form.bpm_max.value;
    const bpm = s.bpm && (lo || hi) ? [Number(lo || hi), Number(hi || lo)] : null;
    const specs = {};
    for (const k of s.specs) { const el = form[`spec_${k}`]; if (el && el.value) specs[k] = Number(el.value); }
    return { facets: Object.fromEntries(Object.entries(facets).filter(([, v]) => v.length)), bpm, specs };
  }

  // Wires a form: one value only where a field takes one, and suggestions tick their box.
  function wire(root) {
    if (root.dataset.sdWired) return; // the Studio reuses one root for every view
    root.dataset.sdWired = "1";
    root.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.matches("[data-sd][data-single]") && t.checked) {
        t.closest(".sd-values").querySelectorAll("input:checked").forEach((x) => { if (x !== t) x.checked = false; });
      }
    });
    root.addEventListener("click", (ev) => {
      const add = ev.target.closest("[data-sd-add]");
      if (!add) return;
      const box = add.closest("form").querySelector(`[data-sd="${add.dataset.sdAdd}"][value="${add.dataset.v}"]`);
      if (box) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
      add.remove();
    });
  }

  GS.studioDetails = { fields, read, wire };
})();
