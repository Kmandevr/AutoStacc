---
title: Processing engine
summary: The Rust processing engine (engine/): safe ZIP reading, SHA-256/CRC-32, format identification, header facts, suggestions and (native only) audio analysis for tempo, key and a waveform; built natively for a Cloudflare Container run by the engine Worker (workers/engine/) and as WebAssembly for the Pack Builder's Web Workers; its loader, CI and benchmarks. Phase 0 of the Pack Builder plan.
covers: [engine/, js/engine/, test/bench/, scripts/lib/synth.js, workers/engine/, .github/workflows/engine.yml, .github/workflows/engine-fuzz.yml, test/unit/engine-worker.test.js, test/unit/mock-engine.test.js, test/mock-engine/, scripts/engine-conformance.js, scripts/engine-fixtures.js, scripts/engine-smoke.js, scripts/engine-wasm.js, scripts/lib/json-schema.js]
updated: 2026-10-14
---

# Processing engine

The engine does the CPU-heavy work on creators' files. Plan and the system around it: [packs](packs.md) (mostly PLANNED). It runs the Pack Builder (Phases 0–8 built): the engine core, suggestions and audio analysis, its WebAssembly build and JS loader, the server Container and engine Worker (deployed by CI from main), and the benchmarks below.

## What it does

| Module (`engine/src/`) | Job |
| --- | --- |
| `source.rs` | Random-access bytes (`Source`): a file natively, a host callback in WebAssembly, a byte vector in tests. The engine never opens files or sockets itself |
| `hash.rs` | SHA-256 (identity of the bytes, compared end to end) and CRC-32 (ZIP), fed in chunks |
| `zipread.rs` | Lists a ZIP from its central directory (ZIP64, UTF-8 or code page 437 names) and checks every entry before anything is extracted; streams each file out through zlib-rs, stopping the moment output passes the declared size, and checks the CRC |
| `formats.rs` | What a file really is from its bytes; the extension is only a hint, and a file whose bytes contradict its name is flagged. Format slugs and extensions are the store vocabulary's `FORMATS` (`server/discovery/vocabulary.js`), also the upload allow-list's; `test/unit/asset-vocabulary.test.js` keeps all three in step |
| `facts.rs` | Facts from headers: WAV (incl. RF64, float, extensible), AIFF/AIFC, FLAC, MIDI (format, tracks, PPQ, notes, length). Things written into files by people (ACID tempo and one-shot flag, smpl loops, MIDI tempo, time and key signatures) are kept apart as `embedded` claims |
| `naming.rs` | Reads names: splits folder and file names into words ("Kick01_128bpm" → Kick, 01, 128, bpm), matches words and phrases ("one shots", "hi hat") against the vocabulary the job sends, and finds a tempo ("128 BPM"; a bare number only for loops and MIDI) or a key ("Am", "C#min", "Db major"; never a bare note) written in a name |
| `analysis.rs` | Native only (not in the WebAssembly build, to keep the browser download small), and only when the job asks (`analyze: true`, CLI `--analyze`): decodes the first 30 s of WAV, AIFF, FLAC, MP3 and OGG (symphonia; at most 24 MB of each file is kept while it streams past) and estimates a **tempo** (spectral flux onsets, autocorrelation, snapped to whole 4/4 bars when the file is a loop; half and double time named as rivals and lowering confidence), a **key** (chroma against Krumhansl–Kessler profiles, weighted by each frame's bass note and the opening, sure only when it stands out from its relative key) and 100 **waveform peaks**. Nothing for material without a pulse (too little change, or change without regularity: pads, noise) or without a key (noise, drums). Files it can't decode get the warning `audio_does_not_decode`, silent ones (under -60 dBFS, heard to their end: a long stem quiet for its first 30 s isn't) `silent_audio`; Ogg streams in a codec other than Vorbis (Opus) are simply not heard. A header with a sample rate or channel count of 0 never reaches a decoder, and any decoder panic on a crafted file is caught and reported as `audio_does_not_decode` (the release build unwinds for this; the security review found symphonia's probe panics on a 0 Hz WAV or AIFF, which with `panic = "abort"` ended the Container on every retry). Accuracy: [Analysis](#analysis-phase-8-2026-10-14) |
| `classify.rs` | Suggestions from evidence, only when the job sends a vocabulary: kind, instrument, tempo, key and MIDI role, each with its origin (`filename`, `folder-name`, `embedded`, `rule`, `analysis`), a confidence and the reasons. What analysis heard weighs at most 0.8 (`ANALYSIS_MAX`, under the store's auto-accept of 0.85, so a heard value never counts until someone accepts it). Against a value a name, folder or header gives, it supports it when it agrees (a tempo within 1%), says nothing for the usual near miss (half or double time, the relative key) and otherwise is a rival at half weight: it can question what the creator wrote ("but gs-major"), never replace it. A value is marked `analysis` only when nothing but listening says it. A heard tempo isn't evidence that a file is a loop (analysis already fits it to the length). Agreeing evidence adds up, a rival value lowers it and is named ("but one-shots"); the nearest name decides the instrument (`Drums/Kicks/…` is a kick); a loop's tempo is checked against its length (whole 4/4 bars). The format decides the kind of everything but audio. The weights are starting values, to be calibrated on labelled packs (Phase 8). A pure step over the engine's own answer, so it can be switched off or replaced on its own |
| `job.rs` | Entry points in the JSON job contract (version 1): `list_archive` (instant tree and problems), `inspect_archive[_part]` (every file read once: hashes, format, facts; originals handed to a sink), `inspect_file` |
| `main.rs` | Command line: `list`, `inspect [--extract <dir>]`, `file` (each with `--vocabulary <file>` for suggestions; `inspect --analyze` adds analysis), and `serve` (the Container's HTTP service) |
| `serve.rs`, `r2.rs` | Native only. `GET /healthz`, `POST /v1/jobs {op, source: {bucket, key}}`, one job at a time (another gets 503 `busy`); storage read in 8 MiB ranged blocks over plain HTTP from `R2_ENDPOINT/<bucket>/<key>` (on Cloudflare `http://storage.engine`, answered by the engine Worker), buckets limited to `R2_BUCKETS`; no credentials. Local files only with `ENGINE_ALLOW_LOCAL=1` (development) |
| `abi.rs` | WebAssembly interface: `engine_call` (JSON in, JSON out), bytes pulled through `host_read`, originals pushed through `host_sink` |

**Refused archive entries** (never extracted): path traversal, absolute or drive paths, control characters, Windows reserved names, depth over 32 or path over 1,024 bytes, symlinks, encryption, unsupported compression, compression ratio over 200:1 for files over 1 MB, entries whose data overlaps another's or runs into the central directory, damaged entries, and files whose content doesn't match their name. **Warnings:** duplicate names and names that differ only in case. **Ignored:** `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`. Archive-wide limits: 10,000 entries, 64 MB central directory, 50 GB total.

The site serves the WebAssembly build as `js/engine/autostacc_engine.wasm` (rebuilt and copied by `node scripts/engine-wasm.js` after engine changes; CI checks the committed copy passes conformance and carries the engine's version). `js/engine/engine-worker.js` runs it for the Pack Builder's preview, so the admin page itself never needs `'wasm-unsafe-eval'`. `js/engine/engine-wasm.js` loads the WebAssembly build in a browser Web Worker (sources are Blobs read with `FileReaderSync`) or in Node (`fs.readSync`), with no generated bindings. `inspect` takes a share `[i, n]` so n Web Workers split one archive; `list`, `inspect` and `file` take an optional vocabulary for suggestions, so the Pack Builder can show them before anything uploads.

**The vocabulary** comes from the store's own (`engineVocabulary()` in `server/discovery/vocabulary.js`: kinds with their formats, the words that mean a kind, an instrument or a MIDI role, the key values and the tempo range); the server sends it with each job and the engine compiles none of it in. `scripts/build.js` writes a copy for the conformance suite, `engine/conformance/vocabulary.json` (`--check` keeps it current).

## The contract, and replacing the engine

The site only ever reads the engine's JSON, never its code, so the engine can be replaced by anything that keeps the contract (owner's requirement; [packs](packs.md#replaceability-owner-requirement-r)).

- **Contract v1** (`engine/contract/v1/`): JSON schemas for a job (`job.schema.json`), an archive answer (`archive-result.schema.json`: `list` and `inspect`), one file (`file-result.schema.json`, `issue.schema.json`, `suggestion.schema.json`), the vocabulary a job may carry (`vocabulary.schema.json`; added in engine 0.2.0, optional, so older answers stay valid), and a file's `analysis` (`{ bpm, key, peaks, analyzedMs }`, added in engine 0.3.0 with the job's `analyze`, optional the same way) and a failed job (`error.schema.json`), plus every code an engine may answer (`errors.json`: archive, file and service codes). A breaking change becomes v2, served beside v1.
- **Conformance** (`engine/conformance/`): `cases/` are small fixed archives (a normal pack and its next version for revisions, that version as the Pack Builder's thin ZIP sends it (`js/zip-thin.js`) and an empty archive, unsafe paths, a symlink and encrypted entry, bombs, deceptive and damaged files, colliding and code-page-437 names, overlapping entries, not a ZIP), written by `node scripts/engine-fixtures.js`; `pack-names` covers how creators name things (kinds, instruments, tempos and keys in names, a tempo that fits the length and one that doesn't, a name and a header that disagree). `analysis` holds synthetic audio (`scripts/lib/synth.js`): a 120 BPM break, a 100 BPM A minor chord loop, a kick, noise, silence, a WAV in a codec nothing decodes, WAV and AIFF headers with a sample rate of 0, an Ogg Opus stub, and a text file that deflates well (for the store's deflate variants). `expected/` holds the answer each must get to `list`, `inspect`, `inspect` with the vocabulary (`<case>.suggest.json`) and, for engines that analyze (not the WebAssembly build), with the vocabulary and analysis (`<case>.analyze.json`; confidences may differ by 0.05 and peaks by 2 between CPUs). `node scripts/engine-conformance.js` checks the command-line build (`--wasm <file>` the WebAssembly build, `--http <url>` an engine service) against the schemas and the expected answers; `--update` rewrites them from the current engine for review. All three builds pass; CI runs the CLI and WebAssembly checks.
- **Fuzzing** (`engine/fuzz/`, nightly Rust and `cargo-fuzz`): `zip` (any bytes as an archive: list, inspect and suggest; the sink never gets more bytes than an entry declares), `headers` (any bytes as every known format) and `names` (any text as a path). `cargo +nightly fuzz run <target>` from `engine/`. First run (2026-10-10): 90 s each, about 8.3 million inputs, no crash. `.github/workflows/engine-fuzz.yml` runs each for five minutes every Monday and keeps any crashing input.
- **Mock engine** (`test/mock-engine/server.js`): the same HTTP contract, answering from `expected/`, for tests that shouldn't need Rust or Docker. A unit test runs the conformance suite against it, so it can't drift from the real one.

## Server side: Container and engine Worker

```
Pages API (later: Queue producer)        workers/engine/ (JS)                      Container (engine/Dockerfile)
  job {jobId, op, bucket, key}  ──Queue──►  queue(): check job (src/jobs.js)  ──►    autostacc-engine serve :8080
                                            one named instance, 1 at a time         reads the object via storage.engine
  read jobs/<id>/result.json  ◄──R2──────   stores the answer in FILES          ◄──  JSON job contract
```

- **Why a separate Worker:** Pages Functions can't consume Queues or own Containers. The Worker is thin: it checks each job (`checkJob`: known operation, allowed bucket, safe key and id), runs it on the one engine instance and stores the answer at `jobs/<id>/result.json` in `FILES`. Failures are retried three times 30 s apart, then land in `autostacc-engine-jobs-failed`, which writes `jobs/<id>/failed.json`.
- **Container:** `basic` instance (¼ vCPU, 1 GiB, 4 GB disk), `max_instances` 1, queue concurrency 1, asleep 15 s after its last job (billing stops when it sleeps). No internet and no storage credentials (`enableInternet = false`): its only way out is `http://storage.engine`, which the engine Worker answers from its R2 binding for the buckets in `R2_BUCKETS`, reads only (`outboundByHost`, which needs the Worker to export `ContainerProxy`). A compromised engine can read the job bucket and nothing else. The image is a static musl build on an empty base (~4.5 MB), running as an unprivileged user.
- **Secrets** (GitHub, copied by the deploy): optional `ENGINE_ADMIN_TOKEN` (32+ characters) for the smoke-test routes: `GET /v1/health`, `POST /v1/jobs`, `GET /v1/jobs/<id>` on the Worker's workers.dev address with `Authorization: Bearer <token>`. Without the token every route answers 404. Optional `SWEEP_TOKEN` (the same value the store gets) turns on the Worker's daily cron (04:23 UTC), which asks the store to run its retention sweep ([packs](packs.md)); the Worker itself never touches the database. The API token (`CLOUDFLARE_API_TOKEN`, shared with the site's deploy) also needs, under Account: Workers Scripts Edit, Queues Edit, Containers Edit and Account Settings Read (plus Pages, D1 and R2 Storage Edit for the site). Before building, the deploy checks the token (and lists its permissions when it may read them) and asks Cloudflare for Containers access; it names the missing permission when Cloudflare refuses (code 10000).
- **CI** (`.github/workflows/engine.yml`): format, lints (native and WebAssembly), tests, a native-vs-WebAssembly parity check on a generated pack, the image build with a health check; on main (or by hand) the deploy creates the queues if missing, deploys the Worker and Container and sets the secrets. The deploy is skipped with a warning when the API token is missing. With `ENGINE_ADMIN_TOKEN` set, a smoke test follows (`scripts/engine-smoke.js`): it puts the `pack-basic` conformance case in R2, has the deployed engine inspect it with the vocabulary, checks the answer equals the expected one, prints the Container's cold start and the job's times, and removes what it wrote.

## Building and testing

```
cd engine
cargo test                    # 34 tests: hashes, path rules, symlinks, encryption, bombs, overlaps, CRC, formats, facts, suggestions, analysis
cargo run --release --example analyze -- <file.wav>   # what analysis hears in a file, and the measures behind it
cargo clippy --all-targets    # also: --release --lib --target wasm32-unknown-unknown
cargo build --release         # native binary: target/release/autostacc-engine
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown   # target/wasm32-unknown-unknown/release/autostacc_engine.wasm
ENGINE_ALLOW_LOCAL=1 target/release/autostacc-engine serve 127.0.0.1:8080   # the Container's service, reading local files
docker build -t autostacc-engine engine/                       # the Container image (needs network for crates)
```

Benchmarks (generated packs land in `test/bench/out/`, ignored by git):

```
node test/bench/make-pack.js --mb 1024 [--store]    # synthetic pack: 24-bit WAV one-shots and loops, MIDI, folders
node test/bench/engine-bench.js <pack.zip>          # native and WebAssembly in Node; fails if their results differ
node test/bench/browser-bench.js <pack.zip>         # WebAssembly in headless Chromium, 1, 2 and 4 Web Workers
node test/bench/delta-bench.js                       # how much of a revised WAV a delta store could reuse (decisions)
node test/bench/analysis-set.js                      # analysis accuracy on 183 labelled synthetic files (above)
```

## Analysis (Phase 8, 2026-10-14)

`node test/bench/analysis-set.js` builds 183 labelled synthetic files (drum loops in three patterns at 11 tempos from 70 to 174 BPM, straight, swung and with noise; chord loops in all 24 keys, alone and with drums; pads; one-shots; noise), runs `inspect --analyze` and writes `test/bench/out/analysis-report.md` (`SHOW=tempo` or `SHOW=key` lists the misses). Synthetic material: a floor for the engine, not a measure of real music.

| Material | Tempo right | Half or double | Key right | Relative key | Said where there's none |
| --- | --- | --- | --- | --- | --- |
| Drum loops (99) | 76–82% | 18–24% | – | – | no key on any |
| Chord loops, with and without drums (48) | 100% | 0% | 75–79% | 21–25% | – |
| Pads (12) | – | – | 92% | 0% | no tempo on any |
| One-shots, noise (24) | – | – | – | – | nothing on any |

| Confidence ≥ | Tempo precision (given) | Key precision (given) |
| --- | --- | --- |
| 0.5 | 88% (111) | 97% (39) |
| 0.6 | 92% (37) | 100% (35) |
| 0.8 | 92% (37) | 100% (28) |
| 0.95 | 96% (25) | 100% (18) |

Every tempo miss is half or double time, and each says so in its reasons ("or 60 (half or double time)") at a lowered confidence; every key miss is the relative key, at a confidence under 0.45. Because no analysis value reaches the auto-accept, these numbers decide only what the creator is offered. Cost: about 5.8 ms a file on the labelled set; on the 1 GB bench pack (918 files, 826 of them audio) `inspect` took 4.4 s and `inspect --analyze` 8.5 s on 4 vCPUs here, so about 4 s more per GB, more on the `basic` instance (¼ vCPU).

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
- **Container, measured locally** with the `basic` instance's limits (`docker run --cpus 0.25 --memory 1g`, the static image): healthy 0.5 s after start; the 1 GB deflated pack inspected in 20.5 s, the stored one in 5.0 s; memory in use about 7 MB.
- **What the $5 plan's Container allowance covers:** a job costs about 1 GiB × (job time + 15 s awake after it). For a 1 GB deflated pack that is about 36 GiB-seconds, so the 25 GiB-hours included are roughly 2,500 such packs a month; CPU (375 vCPU-minutes) allows about 4,400 and disk (200 GB-hours) about 5,000. Memory is the limit, far above the plan's estimate of 250–500. R2 transfer time inside Cloudflare isn't measured yet.
- **Browser:** a 1 GB pack is checked in about 8 seconds with 4 Web Workers, far less than uploading it takes (about 3 minutes at 50 Mbit/s), so processing never holds up the creator.

- **Deployed on Cloudflare (2026-10-10, smoke test on the `pack-basic` case):** health answered in 0.3–0.7 s from asleep; a queued job answered in 2.9 s end to end (1.3 s waiting in the queue, 0.6 s in the Worker, 0.4 s inside the engine), first attempt. A running Container keeps its image until it stops, and frequent requests keep it awake; the smoke test therefore asks for `/v1/health?restart=1` (admin token only) when the old version answers, and waits for the new one. Engine 0.2.0 (suggestions) passed live on 2026-10-10: health 0.9 s from asleep, a queued inspect with the vocabulary answered in 4.5 s end to end (1.8 s in the queue, 0.6 s inside the engine). Every `process` job also starts a fresh Container (about half a second).

Not measured yet: storage throughput through the engine Worker on a large pack, and billed usage per job (needs Account Analytics read access, for the budget guard).
