// Signed-in devices as Settings shows them (server/auth/devices.js): a readable label from the User-Agent, and dates
// in ISO whatever form Better Auth stored them in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, iso } from "../../server/auth/devices.js";

test("device labels name the browser and system, Chromium forks before Chrome, Chrome before Safari", () => {
  const cases = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Chrome on Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Safari on macOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1", "Chrome on iOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Linux"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36", "Samsung Internet on Android"],
    ["Mozilla/5.0 (X11; CrOS x86_64 15917.71.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 OPR/114.0", "Opera on ChromeOS"],
    ["node", "Unknown device"],
    ["", "Unknown device"],
    [null, "Unknown device"]
  ];
  for (const [ua, label] of cases) assert.equal(deviceLabel(ua), label, String(ua));
});

test("dates come back as ISO from text, milliseconds or seconds, and nothing from garbage", () => {
  const at = "2026-10-08T12:00:00.000Z";
  assert.equal(iso(at), at);
  assert.equal(iso(Date.parse(at)), at);
  assert.equal(iso(Date.parse(at) / 1000), at);
  assert.equal(iso("not a date"), null);
  assert.equal(iso(null), null);
  assert.equal(iso(""), null);
});
