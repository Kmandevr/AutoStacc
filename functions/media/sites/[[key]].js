// Creator site images at /media/sites/<asset id>, from the PREVIEWS bucket, only while the image is active and its
// creator isn't suspended. Served with the type sniffed at upload (always an image), never as a page that could run.
import { servableImage } from "../../../server/sites/images.js";

const ID = /^as_[a-z2-7]{20,40}$/;

export async function onRequestGet({ env, params }) {
  const parts = [].concat(params.key || []);
  const id = parts.join("/");
  if (parts.length !== 1 || !ID.test(id) || !env.PREVIEWS || !env.DB) return new Response("Not found", { status: 404 });
  const row = await servableImage(env.DB, id);
  const object = row && await env.PREVIEWS.get(row.r2_key);
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
      ETag: object.httpEtag
    }
  });
}
