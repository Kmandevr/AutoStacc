// Builds the processing engine's WebAssembly (engine/, docs/engine.md) and puts it where the site serves it:
// js/engine/autostacc_engine.wasm, which the Pack Builder's Web Worker (js/engine/engine-worker.js) lists ZIPs with
// before anything uploads. Run after changing the engine (needs Rust with the wasm32-unknown-unknown target):
//   node scripts/engine-wasm.js
// The Engine workflow checks the committed copy keeps the contract and matches the engine's version.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
execFileSync("cargo", ["build", "--release", "--lib", "--target", "wasm32-unknown-unknown"], { cwd: path.join(ROOT, "engine"), stdio: "inherit" });
const from = path.join(ROOT, "engine/target/wasm32-unknown-unknown/release/autostacc_engine.wasm");
const to = path.join(ROOT, "js/engine/autostacc_engine.wasm");
fs.copyFileSync(from, to);
console.log(`${path.relative(ROOT, to)}  ${fs.statSync(to).size} bytes`);
