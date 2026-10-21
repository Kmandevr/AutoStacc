// Studio API, site files: the images and fonts a creator uploads for their sites (server/sites/images.js checks their
// bytes and the creator's one storage quota). Raw upload: PUT the file's bytes with ?filename=... . Deleting a file a
// published site or a kept version still uses hides it until nothing does. Any member of the creator may upload and
// delete (sites and product pages both use these files).
import { json, fail, str } from "../lib/http.js";
import { requireUser } from "../auth/session.js";
import { limit } from "../lib/ratelimit.js";
import { requireCreator } from "../creators/creators.js";
import { uploadImage, deleteImage } from "../sites/images.js";
import { safeFilename } from "../storage/buckets.js";

async function upload(app, { creatorId }) {
  const user = await requireUser(app);
  await limit(app, "studio-upload", 30, 600);
  const { creator } = await requireCreator(app.db, creatorId, user, undefined, { allowCatalog: true });
  const filename = safeFilename(str(new URL(app.request.url).searchParams.get("filename") || "image", "filename", { max: 120 }));
  return json({ image: await uploadImage(app, creator, user, filename) }, 201);
}

async function remove(app, { creatorId, imageId }) {
  const user = await requireUser(app);
  const { creator } = await requireCreator(app.db, creatorId, user, undefined, { allowCatalog: true });
  if (typeof imageId !== "string" || !/^as_[a-z2-7]{20,40}$/.test(imageId)) fail(404, "not_found", "No file with that id.");
  return json({ ok: true, ...(await deleteImage(app, creator.id, imageId)) });
}

export const routes = [
  ["PUT", "/api/studio/creators/:creatorId/images", upload],
  ["DELETE", "/api/studio/creators/:creatorId/images/:imageId", remove]
];
