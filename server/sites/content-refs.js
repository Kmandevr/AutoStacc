// What a site's Releases and Events elements show (docs/builder.md): the published releases (newest first) and the
// published upcoming events (soonest first) of the creator's own projects that the document names, as small cards for
// the shared renderer (js/site-elements.js). Only projects already checked as the creator's own reach this; the
// renderer also needs the project in ctx.projects (published, or the one being published) before it draws them.
import { all } from "../lib/db.js";
import { select, publicRelease, publicEvent, today } from "../content/content.js";

export const MAX_RELEASES = 12;
export const MAX_EVENTS = 20;

const LIVE = "x.published = 1 AND x.deleted_at IS NULL AND p.deleted_at IS NULL AND x.project_id = ?";

const releaseCard = (r) => {
  const v = publicRelease(r);
  return { title: v.title, type: v.type || "", date: v.date || "", path: v.path, artwork: v.artwork && v.artwork.src ? { src: v.artwork.src, alt: v.artwork.alt || "" } : null };
};
const eventCard = (r) => {
  const v = publicEvent(r);
  return { title: v.title, date: v.date, time: v.time, endDate: v.endDate, venue: v.venue, city: v.city, country: v.country, path: v.path };
};

// projectIds: ids of the creator's own projects. { releases: Map(projectId → [card]), events: Map(projectId → [card]) }.
export async function contentCards(db, projectIds) {
  const ids = [...new Set(projectIds)];
  const rows = await Promise.all(ids.map((id) => Promise.all([
    all(db, `${select("releases")} WHERE ${LIVE} ORDER BY x.release_date DESC, x.created_at DESC LIMIT ?`, id, MAX_RELEASES),
    all(db, `${select("events")} WHERE ${LIVE} AND COALESCE(x.end_date, x.event_date) >= ? ORDER BY x.event_date, x.start_time, x.created_at LIMIT ?`, id, today(), MAX_EVENTS)
  ])));
  return {
    releases: new Map(ids.map((id, i) => [id, rows[i][0].map(releaseCard)])),
    events: new Map(ids.map((id, i) => [id, rows[i][1].map(eventCard)]))
  };
}
