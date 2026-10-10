// Internal maintenance, called by the engine Worker's daily cron (workers/engine/src/index.js), never by browsers:
//   POST /api/internal/sweep   Authorization: Bearer <SWEEP_TOKEN>  → what the retention sweep did (sweep.js)
// Without SWEEP_TOKEN configured, or with any other token, it answers 404 like a missing route.
import { json, fail } from "../lib/http.js";
import { tokenMatches } from "../../workers/engine/src/jobs.js";
import { auditAs } from "../audit/log.js";
import { sweep } from "./sweep.js";

async function runSweep(app) {
  if (!tokenMatches(app.request.headers.get("Authorization"), app.config.sweepToken)) fail(404, "not_found", "Not found.");
  const done = await sweep(app);
  const { versions, ...rest } = done;
  await auditAs(app.db, { userId: null, label: "system: daily sweep" }, "maintenance.sweep", { detail: { ...rest, ...versions } });
  return json({ ok: true, ...done });
}

export const routes = [["POST", "/api/internal/sweep", runSweep, { external: true }]];
