// Reviews on a product's page ([data-reviews="<product id>"], or the Studio product page's ?p=): the average stars and
// count, the latest reviews from verified buyers (no names), and for a signed-in owner of the product a form to rate it
// (1 to 5 stars, optional text), edit or delete their review. Talks to /api/products/:id/reviews (server/reviews/).
// Stays hidden while there's nothing to show and the visitor can't review, or the store is offline. Needs js/util.js.
(function () {
  "use strict";

  const { escapeHTML: e, api } = window.GS;
  const root = document.querySelector("[data-reviews]");
  if (!root) return;
  const id = root.dataset.reviews || new URLSearchParams(location.search).get("p") || "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return;
  const base = `/api/products/${encodeURIComponent(id)}`;
  const stars = (n) => `<span class="review-stars" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
  const day = (iso) => (iso ? iso.slice(0, 10) : "");

  function form(mine) {
    if (!mine.canReview) return "";
    const r = mine.review || { rating: 0, body: "" };
    return `<form class="review-form" data-review-form><h3>${mine.review ? "Your review" : "Review this product"}</h3>
      ${r.hidden ? '<p class="msg">AutoStacc hid your review. You can still change or delete it.</p>' : ""}
      <fieldset class="review-rating"><legend>Your rating</legend>${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}"${r.rating === n ? " checked" : ""} required> ${n} star${n === 1 ? "" : "s"}</label>`).join("")}</fieldset>
      <div class="field"><label>What you thought (optional) <textarea name="body" maxlength="1000" rows="3">${e(r.body)}</textarea></label></div>
      <p class="small-print">Shown as "Verified buyer", without your name, while you own this product.</p>
      <button class="btn small" type="submit">Save review</button>
      ${mine.review ? '<button class="btn ghost small" type="button" data-review-delete>Delete</button>' : ""}
      <p class="msg" role="status" data-review-msg hidden></p></form>`;
  }

  async function draw() {
    const res = await api(`${base}/reviews`);
    if (!res.ok) return;
    const x = res.data;
    if (!x.count && !x.mine.canReview) { root.hidden = true; return; }
    root.hidden = false;
    root.innerHTML = `<div class="wrap"><div class="section-head"><h2>Reviews</h2></div>
      ${x.count ? `<p class="review-summary">${stars(Math.round(x.average))} ${e(String(x.average))} out of 5 · ${x.count} review${x.count === 1 ? "" : "s"} from verified buyers</p>` : "<p>No reviews yet.</p>"}
      <ul class="review-list">${x.reviews.map((r) => `<li class="review">${stars(r.rating)} <span class="small-print">Verified buyer · ${e(day(r.createdAt))}${r.edited ? " · edited" : ""}</span>
        ${r.body ? `<p>${e(r.body)}</p>` : ""}</li>`).join("")}</ul>
      ${form(x.mine)}</div>`;
    const f = root.querySelector("[data-review-form]");
    if (!f) return;
    const say = (text) => { const m = f.querySelector("[data-review-msg]"); m.hidden = false; m.className = "msg error"; m.textContent = text; };
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      const out = await api(`${base}/review`, { method: "PUT", body: { rating: Number(f.rating.value), body: f.body.value } });
      if (!out.ok) { btn.disabled = false; return say(out.error.message); }
      draw();
    });
    const del = f.querySelector("[data-review-delete]");
    if (del) del.addEventListener("click", async () => {
      del.disabled = true;
      const out = await api(`${base}/review`, { method: "DELETE", body: {} });
      if (!out.ok) { del.disabled = false; return say(out.error.message); }
      draw();
    });
  }

  draw();
})();
