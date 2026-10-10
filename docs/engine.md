---
title: Processing engine
summary: The Rust processing engine (engine/): safe ZIP reading, SHA-256/CRC-32, format identification and header facts; one crate built natively (server Container) and as WebAssembly (Pack Builder Web Workers), with its JS loader and benchmarks. Phase 0 of the Pack Builder plan.
covers: [engine/, js/engine/, test/bench/]
updated: 2026-10-10
---

# Processing engine

The engine does the CPU-heavy work on creators' files. Plan and the system around it: [packs](packs.md) (mostly PLANNED). What exists today is Phase 0: the engine core, its WebAssembly build, its JS loader and the benchmarks below. Nothing on the site uses it yet; no Container, Queue or engine Worker is deployed.

## What it does

| Module (`engine/src/`) | Job |
| --- | --- |
| `source.rs` | Random-access bytes (`Source`): a file natively, a host callback in WebAssembly, a byte vector in tests. The engine never opens files or sockets itself |
| `hash.rs` | SHA-256 (identity of the bytes, compared end to end) and CRC-32 (ZIP), fed in chunks |
| `zipread.rs` | Lists a ZIP from its central directory (ZIP64, UTF-8 or code page 437 names) and checks every entry before anything is extracted; streams each file out through zlib-rs, stopping the moment output passes the declared size, and checks the CRC |
| `formats.rs` | What a file really is from its bytes; the extension is only a hint, and a file whose bytes contradict its name is flagged |
| `facts.rs` | Facts from headers: WAV (incl. RF64, float, extensible), AIFF/AIFC, FLAC, MIDI (format, tracks, PPQ, notes, length). Things written into files by people (ACID tempo and one-shot flag, smpl loops, MIDI tempo, time and key signatures) are kept apart as `embedded` claims |
| `job.rs` | Entry points in the JSON job contract (version 1): `list_archive` (instant tree and problems), `inspect_archive[_part]` (every file read once: hashes, format, facts; originals handed to a sink), `inspect_file` |
| `main.rs` | Command line, as the Container will run it: `list`, `inspect [--extract <dir>]`, `file` |
| `abi.rs` | WebAssembly interface: `engine_call` (JSON in, JSON out), bytes pulled through `host_read`, originals pushed through `host_sink` |

**Refused archive entries** (never extracted): path traversal, absolute or drive paths, control characters, Windows reserved names, depth over 32 or path over 1,024 bytes, symlinks, encryption, unsupported compression, compression ratio over 200:1 for files over 1 MB, entries whose data overlaps another's or runs into the central directory, damaged entries, and files whose content doesn't match their name. **Warnings:** duplicate names and names that differ only in case. **Ignored:** `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`. Archive-wide limits: 10,000 entries, 64 MB central directory, 50 GB total.

`js/engine/engine-wasm.js` loads the WebAssembly build in a browser Web Worker (sources are Blobs read with `FileReaderSync`) or in Node (`fs.readSync`), with no generated bindings. `inspect` takes a share `[i, n]` so n Web Workers split one archive.

## Building and testing

```
cd engine
cargo test                    # 19 tests: hashes, path rules, symlinks, encryption, bombs, overlaps, CRC, formats, facts
cargo clippy --all-targets    # also: --release --lib --target wasm32-unknown-unknown
cargo build --release         # native binary: target/release/autostacc-engine
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown   # target/wasm32-unknown-unknown/release/autostacc_engine.wasm
```

Benchmarks (generated packs land in `test/bench/out/`, ignored by git):

```
node test/bench/make-pack.js --mb 1024 [--store]    # synthetic pack: 24-bit WAV one-shots and loops, MIDI, folders
node test/bench/engine-bench.js <pack.zip>          # native and WebAssembly in Node; fails if their results differ
node test/bench/browser-bench.js <pack.zip>         # WebAssembly in headless Chromium, 1, 2 and 4 Web Workers
```

## Measurements (Phase 0, 2026-10-10)

Machine: this repository's cloud development container, Intel Xeon @ 2.1 GHz (4 cores, SHA extensions). Pack: 918 files, 1,027 MB of audio and MIDI; 934 MB as a deflated ZIP (WAV saves about 9%, as with real audio), 1,027 MB stored. Single thread unless noted.

| Run | Deflated pack | Stored pack |
| --- | --- | --- |
| Native: list (central directory) | 0.01 s | 0.01 s |
| Native: inspect (extract + SHA-256 + CRC + format + facts) | 4.9 s (192 MB/s) | 1.1 s (960 MB/s) |
| WebAssembly in Node: inspect | 9.8 s (95 MB/s) | 4.9 s (209 MB/s) |
| WebAssembly in Chromium, 1 Web Worker: list / inspect | 0.7 s / 18.9 s (49 MB/s) | |
| WebAssembly in Chromium, 2 / 4 Web Workers | 13.1 s / 8.4 s (111 MB/s) | |

- Native and WebAssembly give identical results on every file (checked by `engine-bench.js`).
- **Decompression, not hashing, is the cost.** Moving from miniz_oxide to zlib-rs made native inspection 165 → 192 MB/s and WebAssembly 78 → 95 MB/s, same results; it stays. WebAssembly SIMD (`simd128`) changed nothing measurable, so it's off and older browsers work.
- **WebAssembly size:** 389 KB (about 180 KB gzipped); instantiation 2–5 ms.
- **Container estimate:** the `basic` instance has a quarter of a vCPU, so about 45 MB/s for a deflated pack: roughly 25 s of CPU per GB, within the plan's 3–6 minutes per 2 GB pack (reading from and writing to R2 not yet measured).
- **Browser:** a 1 GB pack is checked in about 8 seconds with 4 Web Workers, far less than uploading it takes (about 3 minutes at 50 Mbit/s), so processing never holds up the creator.

Not measured yet (needs the deployed Container): cold start, R2 throughput from the Container, cost per GB.
