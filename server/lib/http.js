// HTTP helpers for the API: JSON responses, typed errors, safe body parsing and small input validators.
// Every handler throws HttpError for expected failures; server/app.js turns anything else into a plain 500.

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const fail = (status, code, message, extra) => {
  throw new HttpError(status, code, message, extra);
};

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex"
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(err) {
  const status = err.status || 500;
  const body = { error: { code: err.code || "server_error", message: err.status ? err.message : "Something broke on our side. Try again in a moment." } };
  if (err.extra) Object.assign(body.error, err.extra);
  return json(body, status);
}

// Reads a JSON object body. Rejects other content types, oversize bodies and anything that isn't a plain object.
export async function readJson(request, maxBytes = 16 * 1024) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) fail(415, "unsupported_media_type", "Send JSON.");
  const text = await request.text();
  if (text.length > maxBytes) fail(413, "too_large", "Request body is too large.");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(400, "bad_json", "Request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "bad_request", "Expected a JSON object.");
  return body;
}

// ---------- validators: return the clean value or throw 400 ----------
const ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function str(value, name, { min = 1, max = 200, pattern } = {}) {
  if (typeof value !== "string") fail(400, "invalid_field", `${name} must be text.`, { field: name });
  const v = value.trim();
  if (v.length < min || v.length > max) fail(400, "invalid_field", `${name} has the wrong length.`, { field: name });
  if (pattern && !pattern.test(v)) fail(400, "invalid_field", `${name} is not valid.`, { field: name });
  return v;
}

export const id = (value, name = "id") => str(value, name, { max: 80, pattern: ID });

export function int(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(400, "invalid_field", `${name} must be a whole number from ${min} to ${max}.`, { field: name });
  }
  return value;
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
export const email = (value, name = "email") => str(value, name, { min: 3, max: 254, pattern: EMAIL }).toLowerCase();

// State-changing requests must come from our own pages (cookie auth + SameSite=Lax is the first line; this is the second).
export function assertSameOrigin(request, siteUrl) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(siteUrl).origin, new URL(request.url).origin]);
  if (!origin || !allowed.has(origin)) fail(403, "bad_origin", "This request must come from the site itself.");
}
