// Public preview clips at /media/previews/<file>, streamed from the PREVIEWS bucket with range support for seeking.
// Paid files live in a different, private bucket and are never reachable from here.
import { getPreview } from "../../../server/storage/buckets.js";

const NAME = /^[\w.\- ()]+\.(mp3|m4a|ogg|wav)$/i;
const TYPES = { mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" };

export async function onRequestGet({ request, env, params }) {
  const parts = [].concat(params.key || []);
  const name = parts.join("/");
  if (parts.length !== 1 || !NAME.test(name) || !env.PREVIEWS) return new Response("Not found", { status: 404 });
  const object = await getPreview(env, `previews/${name}`, request);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": object.httpMetadata && object.httpMetadata.contentType || TYPES[name.split(".").pop().toLowerCase()],
    "Cache-Control": "public, max-age=86400",
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag
  });
  if (!("body" in object) || !object.body) return new Response(null, { status: 304, headers });
  if (object.range && request.headers.has("range")) {
    const { offset = 0, length = object.size - offset } = object.range;
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
