// The engine Worker (docs/engine.md). Queue consumer: each job goes to the one engine Container instance, and the
// engine's JSON answer is stored in R2 at jobs/<id>/result.json (failures after retries at jobs/<id>/failed.json).
// HTTP (only when ENGINE_ADMIN_TOKEN is set, with it as a bearer token): POST /v1/jobs queues a job, GET /v1/jobs/:id
// reads its answer, GET /v1/health starts the Container and asks for its version. Used to smoke-test a deploy.
import { Container, getContainer } from "@cloudflare/containers";
import { checkJob, resultKey, failedKey, engineRequest, tokenMatches, buckets, STORAGE_HOST, writePrefix } from "./jobs.js";
import { relay } from "./storage.js";

// Needed by the Containers library to route the engine's outbound requests through the handlers below.
export { ContainerProxy } from "@cloudflare/containers";

export class EngineContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15s"; // billed while awake: short, since a cold start measured ~0.5 s locally (docs/engine.md)
  enableInternet = false;

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { R2_ENDPOINT: `http://${STORAGE_HOST}`, R2_BUCKETS: env.R2_BUCKETS };
  }
}

// The engine's only way out: storage.engine, answered from the R2 binding (src/storage.js). Reads of the allowed buckets
// at any time; during a process job, the runtime handler below also lets it write under that job's own prefix. The
// Container holds no storage credentials and has no internet.
EngineContainer.outboundByHost = {
  [STORAGE_HOST]: (request, env) => relay(request, env.FILES, buckets(env), null)
};
EngineContainer.outboundHandlers = {
  async storageForJob(request, env, ctx) {
    return relay(request, env.FILES, buckets(env), ctx.params && ctx.params.prefix ? ctx.params : null);
  }
};

const engine = (env) => getContainer(env.ENGINE, "engine");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function runJob(env, job, msg) {
  const started = Date.now();
  const container = engine(env);
  const attempt = msg.attempts;
  if (job.op === "process") {
    await container.setOutboundByHost(STORAGE_HOST, "storageForJob", { jobId: job.jobId, attempt, prefix: writePrefix(job.ownerScope, job.jobId, attempt) });
  }
  try {
    await runOn(container, env, job, msg, started, attempt);
  } finally {
    if (job.op === "process") await container.removeOutboundByHost(STORAGE_HOST);
  }
}

async function runOn(container, env, job, msg, started, attempt) {
  const res = await container.fetch(new Request("http://engine/v1/jobs", { method: "POST", body: JSON.stringify(engineRequest(job, attempt)) }));
  const body = await res.text();
  if (res.status === 503) throw new Error("engine busy");
  if (res.status >= 500) throw new Error(`engine ${res.status}`);
  await env.FILES.put(resultKey(job.jobId), body, { httpMetadata: { contentType: "application/json" }, customMetadata: { status: String(res.status), wallMs: String(Date.now() - started), queueMs: String(started - msg.timestamp.getTime()), attempts: String(msg.attempts) } });
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
        await runJob(env, job, msg);
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
      // Behind the admin token, so the reason for a failure is shown rather than Cloudflare's error page.
      try {
        const res = await engine(env).fetch(new Request("http://engine/healthz"));
        const text = await res.text();
        try {
          return json(JSON.parse(text), res.status);
        } catch {
          return json({ error: "engine_not_json", status: res.status, body: text.slice(0, 500) }, 502);
        }
      } catch (e) {
        return json({ error: "engine_unreachable", reason: String(e && e.stack || e).slice(0, 1000) }, 502);
      }
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
      if (done) return new Response(done.body, { headers: { "Content-Type": "application/json", "X-Engine-Wall-Ms": done.customMetadata?.wallMs || "", "X-Engine-Queue-Ms": done.customMetadata?.queueMs || "", "X-Engine-Attempts": done.customMetadata?.attempts || "" } });
      return (await env.FILES.head(failedKey(m[1]))) ? json({ status: "failed" }, 200) : json({ status: "pending" }, 202);
    }
    return json({ error: "not_found" }, 404);
  }
};
