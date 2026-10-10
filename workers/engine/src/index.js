// The engine Worker (docs/engine.md). Queue consumer: each job goes to the one engine Container instance, and the
// engine's JSON answer is stored in R2 at jobs/<id>/result.json (failures after retries at jobs/<id>/failed.json).
// HTTP (only when ENGINE_ADMIN_TOKEN is set, with it as a bearer token): POST /v1/jobs queues a job, GET /v1/jobs/:id
// reads its answer, GET /v1/health starts the Container and asks for its version. Used to smoke-test a deploy.
import { Container, getContainer } from "@cloudflare/containers";
import { checkJob, resultKey, failedKey, engineRequest, tokenMatches, buckets } from "./jobs.js";

export class EngineContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15s"; // billed while awake: short, since a cold start measured ~0.5 s locally (docs/engine.md)
  enableInternet = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { R2_ENDPOINT: env.R2_ENDPOINT, R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY, R2_BUCKETS: env.R2_BUCKETS };
  }

  // No internet for the engine except R2's S3 endpoint.
  async onStart() {
    if (this.env.R2_ENDPOINT) await this.setAllowedHosts([new URL(this.env.R2_ENDPOINT).hostname]);
  }
}

const engine = (env) => getContainer(env.ENGINE, "engine");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function runJob(env, job) {
  const started = Date.now();
  const res = await engine(env).fetch(new Request("http://engine/v1/jobs", { method: "POST", body: JSON.stringify(engineRequest(job)) }));
  const body = await res.text();
  if (res.status === 503) throw new Error("engine busy");
  if (res.status >= 500) throw new Error(`engine ${res.status}`);
  await env.FILES.put(resultKey(job.jobId), body, { httpMetadata: { contentType: "application/json" }, customMetadata: { status: String(res.status), wallMs: String(Date.now() - started) } });
}

export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      if (batch.queue.endsWith("-failed")) {
        const id = msg.body && msg.body.jobId;
        if (typeof id === "string") await env.FILES.put(failedKey(id), JSON.stringify({ error: "failed_after_retries", attempts: msg.attempts }));
        msg.ack();
        continue;
      }
      let job;
      try {
        job = checkJob(msg.body, buckets(env));
      } catch (e) {
        console.error("dropped malformed job:", e.message);
        msg.ack();
        continue;
      }
      try {
        await runJob(env, job);
        msg.ack();
      } catch (e) {
        console.error(`job ${job.jobId} attempt ${msg.attempts}:`, e.message);
        msg.retry({ delaySeconds: 30 });
      }
    }
  },

  async fetch(request, env) {
    if (!tokenMatches(request.headers.get("Authorization"), env.ENGINE_ADMIN_TOKEN)) return json({ error: "not_found" }, 404);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      const res = await engine(env).fetch(new Request("http://engine/healthz"));
      return json(await res.json(), res.status);
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      let job;
      try {
        job = checkJob({ ...(await request.json()), jobId: crypto.randomUUID().replaceAll("-", "") }, buckets(env));
      } catch (e) {
        return json({ error: "bad_job", reason: e.message }, 400);
      }
      await env.JOBS.send(job);
      return json({ jobId: job.jobId }, 202);
    }
    const m = url.pathname.match(/^\/v1\/jobs\/([a-z0-9_-]{8,64})$/);
    if (request.method === "GET" && m) {
      const done = await env.FILES.get(resultKey(m[1]));
      if (done) return new Response(done.body, { headers: { "Content-Type": "application/json", "X-Engine-Wall-Ms": done.customMetadata?.wallMs || "" } });
      return (await env.FILES.head(failedKey(m[1]))) ? json({ status: "failed" }, 200) : json({ status: "pending" }, 202);
    }
    return json({ error: "not_found" }, 404);
  }
};
