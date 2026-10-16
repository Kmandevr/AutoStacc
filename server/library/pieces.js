// The community library's pieces (owner, 2026-10-15; docs/builder.md, phase 8): elements, sections and whole-site
// templates that trusted creators share, free or for sale. A piece is a fragment of a site document, checked like any
// document (sites/document.js) and stripped of what belongs to its creator alone (their products, projects and audio
// players); its images and fonts must be the creator's own files and stay theirs, counted against their storage only.
// Installing copies the fragment into the installer's draft (the editor gives it new ids) and lets their sites show the
// piece's files. A paid piece is a store product of type "template"; owning it is what lets someone install it.
import { all, first, run, newId, now, parseJson } from "../lib/db.js";
import { fail } from "../lib/http.js";
import { cleanDocument } from "../sites/document.js";
import { ownImages, imageSrc } from "../sites/images.js";

export const KINDS = ["element", "section", "template"];
export const MAX_PIECE_BYTES = 100 * 1024;
// Elements that point at their creator's own products or projects: a buyer's site couldn't show them.
const PERSONAL = new Set(["audio", "follow"]);

const strip = (section) => ({ ...section, elements: section.elements.filter((e) => !PERSONAL.has(e.type)).map((e) => (e.type === "products" ? { ...e, ids: [] } : e)) });

// A checked fragment and the files it uses: { fragment, assets: [ids] }. Throws a 400 naming the problem.
export function cleanFragment(kind, raw) {
  if (!KINDS.includes(kind)) fail(400, "invalid_kind", "Share an element, a section or a whole site.", { field: "kind" });
  if (!raw || typeof raw !== "object") fail(400, "invalid_piece", "Nothing to share.");
  if (JSON.stringify(raw).length > MAX_PIECE_BYTES) fail(413, "too_large", `A piece can be up to ${MAX_PIECE_BYTES / 1024} KB. Share a smaller part.`);
  const wrap = (sections) => ({ version: 2, theme: {}, nav: { items: [] }, pages: [{ slug: "", title: "Piece", sections }] });
  let fragment;
  let refs;
  if (kind === "template") {
    const { doc, ...r } = cleanDocument(raw);
    fragment = { ...doc, pages: doc.pages.map((p) => ({ ...p, sections: p.sections.map(strip) })) };
    refs = r;
  } else {
    const section = kind === "section" ? raw : { id: "s1", rows: Math.max(1, (raw.box && raw.box.h) || 4), elements: [raw] };
    const { doc, ...r } = cleanDocument(wrap([section]));
    const clean = strip(doc.pages[0].sections[0]);
    if (kind === "element" && !clean.elements.length) fail(400, "invalid_piece", "That element shows your own products or projects, so it can't be shared.");
    fragment = kind === "section" ? clean : { ...clean.elements[0], box: { ...clean.elements[0].box, x: 0, y: 0 } };
    refs = r;
  }
  return { fragment, assets: [...new Set([...refs.assets, ...refs.fonts])] };
}

const publicPiece = (p, extra = {}) => ({
  id: p.id, kind: p.kind, title: p.title, description: p.description, priceCents: p.price_cents, productId: p.product_id,
  productPath: p.product_id ? `/product?p=${p.product_id}` : null, installs: p.installs, status: p.status, createdAt: p.created_at,
  creator: { id: p.creator_id, name: p.creator_name, path: `/${p.creator_slug}` }, ...extra
});

// The files a piece shows, as the editor needs them.
async function filesOf(db, piece) {
  const ids = parseJson(piece.assets, []);
  if (!ids.length) return [];
  const rows = await all(db, `SELECT id, filename, content_type, size_bytes FROM site_assets WHERE status = 'active' AND id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return rows.map((a) => ({ id: a.id, src: imageSrc(a.id), filename: a.filename, contentType: a.content_type, sizeBytes: a.size_bytes, shared: true }));
}

const SELECT = `SELECT p.*, c.name AS creator_name, c.slug AS creator_slug FROM library_pieces p JOIN creators c ON c.id = p.creator_id`;

// A paid piece's shape without its content, for someone who doesn't own it: each element as a plain box where it
// sits, so they see the layout before buying but can't copy the words, settings or images.
function outlineOf(kind, fragment) {
  const box = (e) => ({ id: e.id, type: "spacer", box: e.box, style: { bg: "#9aa0ad", radius: 8 } });
  const section = (s) => ({ ...s, cls: [], background: { color: "", asset: "", fit: "cover", overlay: 0, text: "" }, elements: s.elements.map(box) });
  if (!fragment) return null;
  if (kind === "element") return box(fragment);
  if (kind === "section") return section(fragment);
  return { version: 2, theme: { preset: fragment.theme.preset, accent: fragment.theme.accent, font: fragment.theme.font }, nav: { items: [] },
    pages: fragment.pages.map((p) => ({ slug: p.slug, title: p.title, sections: p.sections.map(section) })) };
}

// Listed pieces (active, from active creators), newest first, with what this account owns; plus the asking creator's own.
// Content and files only for pieces this account may use; for the others, an outline.
export async function browse(db, { kind, q, creatorId, owned }) {
  const where = ["p.status = 'active'", "c.status = 'active'", "c.deleted_at IS NULL"];
  const args = [];
  if (kind) { where.push("p.kind = ?"); args.push(kind); }
  if (q) { where.push("(p.title LIKE ? OR p.description LIKE ? OR c.name LIKE ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await all(db, `${SELECT} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC LIMIT 60`, ...args);
  const mine = creatorId ? await all(db, `${SELECT} WHERE p.creator_id = ? AND p.status <> 'removed' AND p.status <> 'deleted' ORDER BY p.created_at DESC`, creatorId) : [];
  const out = new Map();
  for (const p of [...mine, ...rows]) {
    if (out.has(p.id)) continue;
    const usable = !p.product_id || p.creator_id === creatorId || owned.has(p.product_id);
    out.set(p.id, publicPiece(p, { mine: p.creator_id === creatorId, owned: usable,
      ...(usable ? { fragment: parseJson(p.fragment, null), files: await filesOf(db, p) } : { outline: outlineOf(p.kind, parseJson(p.fragment, null)), files: [] }) }));
  }
  return [...out.values()];
}

export const getPiece = (db, id) => first(db, `${SELECT} WHERE p.id = ?`, id);

// A paid piece starts pending: nobody can see or use it until its product is linked and on sale (activate).
export async function share(db, { creator, user, kind, title, description, raw, pending = false }) {
  const { fragment, assets } = cleanFragment(kind, raw);
  if (assets.length) {
    const own = new Set((await ownImages(db, creator.id, assets)).map((a) => a.id));
    if (assets.some((a) => !own.has(a))) fail(400, "invalid_piece", "A piece can only use your own uploaded files.");
  }
  const id = newId("lp");
  const json = JSON.stringify(fragment);
  const t = now();
  await run(db, `INSERT INTO library_pieces (id, creator_id, kind, title, description, fragment, assets, size_bytes, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, creator.id, kind, title, description, json, JSON.stringify(assets), json.length, pending ? "pending" : "active", user.id, t, t);
  return id;
}

export const linkProduct = (db, pieceId, productId, priceCents) =>
  run(db, "UPDATE library_pieces SET product_id = ?, price_cents = ?, updated_at = ? WHERE id = ?", productId, priceCents, now(), pieceId);
export const activate = (db, pieceId) => run(db, "UPDATE library_pieces SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'", now(), pieceId);

// Records an install (once per creator) and returns what the editor needs to insert it.
export async function install(db, piece, creatorId, user) {
  const res = await run(db, "INSERT INTO library_installs (piece_id, creator_id, installed_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING", piece.id, creatorId, user.id, now());
  // The count is shown on the card only; it moves once per creator.
  if (res.meta.changes) await run(db, "UPDATE library_pieces SET installs = installs + 1 WHERE id = ?", piece.id);
  return { kind: piece.kind, title: piece.title, fragment: parseJson(piece.fragment, null), files: await filesOf(db, piece), firstInstall: Boolean(res.meta.changes) };
}

export const setStatus = (db, pieceId, status, note = null) =>
  run(db, "UPDATE library_pieces SET status = ?, removed_note = ?, updated_at = ? WHERE id = ?", status, note, now(), pieceId);

// A takedown remembers what it undoes.
export const takeDown = (db, piece, note, productWasLive) => run(db,
  "UPDATE library_pieces SET status = 'removed', removed_from = ?, product_was_live = ?, removed_note = ?, updated_at = ? WHERE id = ? AND status <> 'removed'",
  piece.status, productWasLive ? 1 : 0, note, now(), piece.id);

// Deletes a piece that was never shared (its product couldn't be made).
export const discard = (db, pieceId) => run(db, "DELETE FROM library_pieces WHERE id = ? AND status = 'pending'", pieceId);

export async function report(db, piece, user, reason) {
  const res = await run(db, "INSERT INTO library_reports (id, piece_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    newId("lr"), piece.id, user.id, reason, now());
  return Boolean(res.meta.changes);
}

// Pieces another creator installed that their sites may still show: active or deleted (never taken down by AutoStacc),
// not their own (their own files are theirs already), and for a paid piece only while whoever installed it still owns
// it (a refund ends it).
const LIVE_INSTALL = `p.status IN ('active', 'deleted') AND p.creator_id <> i.creator_id
  AND (p.product_id IS NULL OR EXISTS (SELECT 1 FROM entitlements e JOIN "user" u ON u.id = i.installed_by
    WHERE e.product_id = p.product_id AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      AND (e.user_id = u.id OR (e.user_id IS NULL AND e.email = lower(u.email)))))`;

// Files of the pieces this creator installed, among these ids: their sites may show them.
export async function installedFiles(db, creatorId, ids) {
  if (!ids.length) return [];
  return all(db, `SELECT DISTINCT a.id FROM library_installs i JOIN library_pieces p ON p.id = i.piece_id AND ${LIVE_INSTALL}
    JOIN json_each(p.assets) j JOIN site_assets a ON a.id = j.value AND a.status = 'active'
    WHERE i.creator_id = ? AND a.id IN (${ids.map(() => "?").join(",")})`, creatorId, ...ids);
}

// The files the installer's editor may use from the pieces it installed.
export async function installedFileList(db, creatorId) {
  const pieces = await all(db, `SELECT p.assets FROM library_installs i JOIN library_pieces p ON p.id = i.piece_id AND ${LIVE_INSTALL} WHERE i.creator_id = ?`, creatorId);
  const ids = [...new Set(pieces.flatMap((p) => parseJson(p.assets, [])))];
  return filesOf(db, { assets: JSON.stringify(ids) });
}
