// Development and tests only: the store stands in for the engine Worker's storage relay, so a local engine (the real
// binary or test/mock-engine) can read uploaded archives and write originals into the local FILES bucket through the
// same code and rules as in production (workers/engine/src/storage.js: reads of the files bucket; writes only under the
// running process job's prefix, never over an object, hashed here). Every other environment answers 404.
import { fail } from "../lib/http.js";
import { first } from "../lib/db.js";
import { relay } from "../../workers/engine/src/storage.js";
import { writePrefix } from "../../workers/engine/src/jobs.js";
import { FILES_BUCKET } from "./engine-client.js";

const BASE = "/api/internal/engine-storage/";

async function storage(app) {
  if (app.config.production || !app.config.devLike || !app.env.ENGINE_URL) fail(404, "not_found", "Not found.");
  const url = new URL(app.request.url);
  // The process job running now, if any: writes are allowed under its prefix only (direct mode runs one attempt).
  const running = await first(app.db, `SELECT j.id, v.owner_scope FROM processing_jobs j JOIN pac_versions v ON v.id = j.version_id
    WHERE j.status = 'running' AND j.kind = 'process' ORDER BY j.updated_at DESC LIMIT 1`);
  const job = running ? { jobId: running.id, attempt: 1, prefix: writePrefix(running.owner_scope, running.id, 1) } : null;
  const inner = new Request(`http://storage.engine/${url.pathname.slice(BASE.length)}`, {
    method: app.request.method,
    headers: app.request.headers,
    body: app.request.method === "PUT" ? app.request.body : undefined,
    duplex: "half"
  });
  return relay(inner, app.env.FILES, [FILES_BUCKET], job);
}

export const routes = [
  ["GET", `${BASE}.*`, storage, { external: true }],
  ["PUT", `${BASE}.*`, storage, { external: true }]
];
