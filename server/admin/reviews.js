// Admin, buyers' reviews (server/reviews/): the latest ones, hidden ones too, and hiding or showing one again with a
// note. Audited; the author's email is never shown here.
import { json, readJson, fail, id, str } from "../lib/http.js";
import { requireAdmin } from "../auth/session.js";
import { audit } from "../audit/log.js";
import { latestReviews, setHidden } from "../reviews/reviews.js";

const shape = (r) => ({ id: r.id, productId: r.product_id, title: r.title || r.product_id, rating: r.rating, body: r.body, createdAt: r.created_at,
  updatedAt: r.updated_at, hiddenAt: r.hidden_at, hiddenNote: r.hidden_note });

async function show(app) {
  await requireAdmin(app);
  return json({ reviews: (await latestReviews(app.db)).map(shape) }, 200, { "Cache-Control": "no-store" });
}

const toggle = (hidden) => async (app, { reviewId }) => {
  const user = await requireAdmin(app);
  const body = await readJson(app.request, 1024);
  const note = hidden ? str(body.note, "note", { min: 3, max: 300 }).trim() : null;
  if (!(await setHidden(app.db, id(reviewId, "reviewId"), hidden, user.id, note))) fail(409, "no_change", hidden ? "That review is already hidden." : "That review isn't hidden.");
  await audit(app, hidden ? "review.hidden" : "review.shown", { targetType: "review", targetId: reviewId, detail: { note } });
  return json({ reviews: (await latestReviews(app.db)).map(shape) });
};

export const routes = [
  ["GET", "/api/admin/reviews", show],
  ["POST", "/api/admin/reviews/:reviewId/hide", toggle(true)],
  ["POST", "/api/admin/reviews/:reviewId/show", toggle(false)]
];
