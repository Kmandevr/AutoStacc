// Checks that an engine keeps the contract (docs/engine.md): runs `list` and `inspect` on every case in
// engine/conformance/cases/, checks each answer against the JSON schemas in engine/contract/v1/, and compares it with the
// expected answer in engine/conformance/expected/ (engineVersion and elapsedMs ignored). Any engine, in any language, that
// passes can replace this one. Modes:
//   node scripts/engine-conformance.js [--cli <binary>]   the command-line build (default engine/target/release/autostacc-engine)
//   node scripts/engine-conformance.js --wasm <file.wasm> the WebAssembly build, through js/engine/engine-wasm.js
//   node scripts/engine-conformance.js --http <url>       an engine service (the Container's, or test/mock-engine/server.js),
//                                                         which must accept local files (ENGINE_ALLOW_LOCAL=1)
//   add --update to rewrite the expected answers from this engine (then review the diff).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { check } = require("./lib/json-schema.js");

const ROOT = path.join(__dirname, "..");
const CASES = path.join(ROOT, "engine/conformance/cases");
const EXPECTED = path.join(ROOT, "engine/conformance/expected");
const CONTRACT = path.join(ROOT, "engine/contract/v1");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const update = process.argv.includes("--update");

async function makeRunner() {
  if (arg("--http")) {
    const base = arg("--http").replace(/\/$/, "");
    return { name: `http ${base}`, run: async (op, file) => (await fetch(`${base}/v1/jobs`, { method: "POST", body: JSON.stringify({ op, source: { file } }) })).json() };
  }
  if (arg("--wasm")) {
    const Engine = require(path.join(ROOT, "js/engine/engine-wasm.js"));
    const engine = await Engine.create(fs.readFileSync(arg("--wasm")));
    return {
      name: `wasm ${arg("--wasm")}`,
      run: async (op, file) => {
        const fd = fs.openSync(file, "r");
        const size = fs.fstatSync(fd).size;
        const src = engine.addSource({ size, read: (o, l) => { const b = Buffer.allocUnsafe(l); return b.subarray(0, fs.readSync(fd, b, 0, l, o)); } });
        try { return op === "list" ? engine.list(src) : engine.inspect(src); } finally { engine.removeSource(src); fs.closeSync(fd); }
      }
    };
  }
  const bin = arg("--cli") || path.join(ROOT, "engine/target/release/autostacc-engine");
  return {
    name: `cli ${path.relative(ROOT, bin)}`,
    run: async (op, file) => {
      try { return JSON.parse(execFileSync(bin, [op, file], { maxBuffer: 1 << 28 })); } catch (e) { return JSON.parse(e.stdout.toString()); }
    }
  };
}

// Only what the contract promises: no versions or timings, keys sorted.
const normal = (v) => {
  if (Array.isArray(v)) return v.map(normal);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) if (k !== "engineVersion" && k !== "elapsedMs") out[k] = normal(v[k]);
    return out;
  }
  return v;
};

(async () => {
  const runner = await makeRunner();
  let failures = 0;
  const cases = fs.readdirSync(CASES).filter((f) => f.endsWith(".zip")).sort();
  fs.mkdirSync(EXPECTED, { recursive: true });
  for (const c of cases) {
    for (const op of ["list", "inspect"]) {
      const name = `${c.replace(/\.zip$/, "")}.${op}.json`;
      const got = await runner.run(op, path.join(CASES, c));
      const schema = path.join(CONTRACT, got && got.error ? "error.schema.json" : "archive-result.schema.json");
      const problems = check(schema, got);
      if (got && got.error) {
        const codes = JSON.parse(fs.readFileSync(path.join(CONTRACT, "errors.json"), "utf8"));
        if (!codes.archive[got.error] && !codes.service[got.error]) problems.push(`unknown error code ${got.error}`);
      } else {
        const codes = JSON.parse(fs.readFileSync(path.join(CONTRACT, "errors.json"), "utf8")).file;
        for (const f of got.files || []) for (const i of f.issues || []) if (!codes[i.code]) problems.push(`${f.path}: unknown issue code ${i.code}`);
      }
      const file = path.join(EXPECTED, name);
      if (update) fs.writeFileSync(file, JSON.stringify(normal(got), null, 1) + "\n");
      else if (!fs.existsSync(file)) problems.push("no expected answer (run with --update)");
      else if (JSON.stringify(normal(got)) !== JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")))) problems.push("differs from the expected answer");
      if (problems.length) failures++;
      console.log(`${problems.length ? "FAIL" : "PASS"} ${name}${problems.length ? `\n  ${problems.slice(0, 8).join("\n  ")}` : ""}`);
    }
  }
  console.log(`${runner.name}: ${failures ? `${failures} failed` : "all passed"} (${cases.length * 2} checks)${update ? ", expected answers rewritten" : ""}`);
  process.exit(failures ? 1 : 0);
})();
