---
title: Pack Builder and processing engine
summary: PLANNED / NOT IMPLEMENTED. Approved plan for the Pack Builder, the asset model (folders, versions, provenance), the Rust processing engine in a Cloudflare Container, selective downloads, derived store facets and staying inside the $5 Workers Paid plan.
covers: [server/files/, server/storage/, server/downloads/, server/studio/product-files.js, server/admin/files.js, server/discovery/vocabulary.js, js/stacc-model.js, data/content-types.js]
updated: 2026-10-10
---

# Pack Builder and processing engine

> **PLANNED, Phase 0 partly built.** This note is the approved plan (owner, 2026-10-10). Built so far: the engine core, its WebAssembly build, the Container image, the engine Worker and CI ([engine](engine.md)), the asset vocabulary (Phase 1a), the engine contract, conformance suite and mock engine (Phase 1b) and the schema with Stacclets and Pacs in the database and the 500 MB quota (Phase 1c, `db/migrations/0014_packs.sql`); nothing on the site uses the engine yet. Feature switches arrive with the first features they control (Phase 3). Not built: pack tables, the Pack Builder UI, bundles, derived facets. Today's file handling is described in [store](store.md) and [library](library.md). Decisions behind it: [decisions](decisions.md#2026-10-10-pack-builder-asset-engine-and-selective-downloads-planned). Work is tracked in issue #101.


> **Rev. 4 (2026-10-10).** The owner re-sent the brief and confirmed **Workers Paid**. The rev. 3 decisions all stand. Two points of the new brief change the design:
>
> 1. **"Use browser-side processing and Web Workers where beneficial."** The same Rust engine is also compiled to WebAssembly for the Pack Builder. That gives an instant tree and error list before anything uploads, uploads per file instead of the whole ZIP, and skips unchanged files in revisions. The Container stays the authority and re-verifies everything.
> 2. **"Prebuild or cache common packages."** Handled as a measured, flagged cache for full-pack ZIPs only (section 8).
>
> Main branch unchanged since rev. 3 (f2e0ae3) [V].

Labels: **[V]** verified in the repo or in Cloudflare's docs this session · **[R]** recommendation · **[A]** assumption, checked in Phase 0 · **[O]** open (section H).

## How this plan follows the vision

[Vision](vision.md) is the owner's product direction and outranks this plan where they differ (the plan is an engineering document under it, as vision §11 asks). Checked 2026-10-10:

| Vision | This plan |
| --- | --- |
| §2.4, §4: one authoritative record for each product, shown in many places | One Pac/asset model and one vocabulary for the builder, store, product pages, library and recommendations; a product's contents are derived from its assets, never copied |
| §4: products show contents, formats and compatibility | Contents tree, formats, BPM/key, sample rate and bit depth come from the files themselves (facts) or the creator (claims), never invented |
| §6: buying gives lasting value; purchase records keep the product version and terms | Every file is identified by its SHA-256 and every pack version is recorded, so a purchase can be tied to what was bought. Owner's decision (H8): buyers keep what they downloaded; a revision's removed or replaced files stay downloadable for 30 days with a notice, then only the latest version is kept, because keeping every version of every file costs too much storage. Unchanged files are stored once |
| §7.2: no corrupted or misrepresented files, malicious-file checks, never claim manual inspection | Integrity checks, content-vs-name checks and archive guards are automated; wording to creators and buyers must say "checked automatically", never "reviewed" or "inspected" |
| §9: free tier with understandable, transparent limits | 500 MB per creator (owner's decision), shown as used/total in the Studio, with a plain message when full |
| §10: creators can download the originals they uploaded | Originals are stored byte for byte, so a creator export of their own files is cheap; added to Phase 9 |
| §2.5: ownership, editing, publishing and money are different roles | The Pack Builder uses today's creator membership; separate roles (who may publish a pack, who may change it) wait for the permissions design and aren't invented here |
| §11, §12: modular, no speculative complexity; automation expands creators' choices, never dictates | The engine sits behind one contract and can be replaced; every feature has a switch; suggestions never reorganize files or overwrite a creator's values |

## Context

AutoStacc sells Pacs through products. Today a Pac's contents are loose `product_files` rows: uploaded one at a time (95 MB cap), typed by extension plus a 16-byte signature, with no checksum, folder, version or per-file metadata. Studio creators can't use Pacs at all. The goal: **creators organize once, AutoStacc understands every file, customers download only what they want.** This plan adds:

- a Pack Builder (ZIP, loose files or folder, revisions);
- an asset model with folders, versions and provenance;
- one canonical vocabulary;
- byte-exact integrity;
- selective downloads;
- store facets derived from contents;
- **one Rust processing engine running natively in a Cloudflare Container on the server**, behind a versioned contract so it can be replaced.

### Owner decisions (this session)

| Topic | Decision |
| --- | --- |
| Pack Builder users | Admin **and** Studio creators in the first release |
| Uploaded master ZIP | Kept only until the version is published or discarded, then deleted; the manifest is authoritative |
| Purchase unit | Whole products (entitlements stay per product); customers download any subset they own |
| Creator storage | **500 MB free per creator**; extra storage will be paid by the creator later (billing out of scope) |
| Revisions for buyers (H8, decided after the vision) | **Buyers keep what they downloaded; files are stored once, git-style.** Unchanged files are shared between versions. A file a revision removes or replaces stays downloadable for 30 days with an "Updated" notice saying what goes and when, then only the latest version remains. Deltas inside a file only if Phase 6 measurements show real savings |
| Library label | "Samples" becomes **"One-shots"** (old values fold to it) |
| Product page before purchase | Contents tree + stats; per-file audio previews deferred |
| Where heavy work runs | **A server Container from the start** (works with the tab closed; same result on every computer) |
| Must be replaceable | **The engine itself**, and **individual features** (switch off or swap one without breaking uploads, purchases or downloads) |
| Scope cuts | No preference → everything stays in scope, sequenced so the core ships first (section F) |
| Workers plan | Containers require **Workers Paid**, so choosing a Container settles it: Paid ($5/month + usage) |
| Workers plan (confirmed) | **Workers Paid, $5/month; stay inside the included usage, no overage charges** |
| Container size | Owner first picked standard-2 / 3 jobs. Under the "no extra charges" rule this becomes **`basic` (¼ vCPU, 1 GiB, 4 GB disk), one job at a time, `sleepAfter` 30 s**: about 25 instance-hours per month inside the allowance instead of about 4. Raised only if Phase 0 shows packs process too slowly |
| Removed files in a revision | Library "Updated" badge + list of removed or replaced files, still downloadable for 30 days; no email |
| Moderation | **Automated review**: the engine's checks decide; only flagged versions wait for an admin (below) |
| Personal collections and tags | **In the first release** (with saved searches) |

---

## A. Current-state audit [V]

**Stack**

- Static HTML/CSS/JS with no framework and no TypeScript. Browser scripts are IIFEs with no modules (`.claude/rules/js.md`).
- npm, Node ≥22.13. Dependencies: `better-auth`, `stripe`; dev: `wrangler`.
- `scripts/build.js` is dependency-free; it generates heads, pages, sitemap, `db/catalog.sql` and `data/vocabulary.js`.
- Deploy: GitHub Actions `deploy.yml`: build check, SEO tests, `npm test`, `scripts/dist.js`, `scripts/cloudflare.js store`, `wrangler pages deploy`. CI: `seo.yml`, `store.yml` (unit + API + Playwright).
- No Rust or WASM tooling. rustc 1.97 is present in this container.

**Cloudflare today** (`wrangler.toml`)

- One Pages project: `functions/` (thin) → `server/app.js` (a 40-line router, one module per area).
- Bindings: D1 `DB`, R2 `FILES` (private), R2 `PREVIEWS` (public). `nodejs_compat`.
- **No Queues, Durable Objects, Containers, KV, cron or WASM.** Background work is only `waitUntil`.

**Files and assets**

| Item | State |
| --- | --- |
| `product_files` (`0002_commerce.sql:31`; `pac_id`, `kind` in `0003`; `status`, `status_note`, `status_at` in `0006`) | Implemented. **No checksum, folder, version, uploader or technical metadata** |
| `server/files/files.js` | `DELIVERABLE`, `deliverableFiles`, `downloadSizes`, `countKept`, `setStatus`, `unpublishEmptyStudioProducts` |
| `server/files/policy.js` | `FILE_TYPES` allow-list, `SIG` 16-byte signatures, `FILE_LIMITS` (95 MB, 100 files), `checkUpload`, `contentTypeFor`, `looksLike` |
| `server/files/upload.js` `putVerifiedFile` | Streams body → R2, peeks 16 bytes, deletes on mismatch |
| `server/storage/buckets.js` | `newFileKey`, get/put/peek/delete, range `getPreview`. **No multipart** |
| Admin upload (`server/admin/files.js`) | `pac`, `kind`, `status`, `replaces` (the replacement link is only in the audit log) |
| Studio upload (`server/studio/product-files.js`) | `pac_id=NULL`, `kind=''` hard-coded. Untrusted → `pending` + `alertAdmins`. Quota 250 MB at planning (500 MB since Phase 1c), 20 files per product, enforced in the INSERT |
| ZIP | Accepted as an opaque file, never unpacked. **No archive, hashing or audio/MIDI code anywhere** |

**Hierarchy**

- Projects are synced to D1 (`source='catalog'|'studio'`).
- **Stacclets and Pacs exist only in `data/`**, joined in the browser.
- `products.pacs` is a JSON list; `scripts/lib/platform.js` validates it.

**Customer side**

- `GET /api/library` returns files `{id, filename, label, contentType, sizeBytes, pacId, kind}`.
- `js/stacc-model.js` (in a Web Worker) builds the Project → Stacclet → Pac → kind tree and the by-kind view; filters live in the URL.
- "Download selected" = sequential signed links, **no ZIP**.
- Downloads: HMAC `dl1.` 5-minute tokens, entitlement re-checked, R2 streamed, `download_events`. Refund only if nothing was downloaded.
- Licences (`data/licenses.js`) restrict redistribution, not partial download.

**Discovery**

- `server/discovery/vocabulary.js` is the only vocabulary: `FACETS` (genre, style, mood, energy, use, contents, format, daw, plugin, key, os, skill), `SCHEMAS`, `SPECS`, `BPM`, `SYNONYMS`.
- `product_facets` + `search_text`/`bpm_min`/`bpm_max` (`0012`).
- **Specs (sample rate, bit depth) are display-only. No instrument facet.**
- **Duplicated vocabularies:** content-types kinds vs the `contents` facet vs product types; three format lists.
- Search is SQL `LIKE` (#97). Recommendations (`rank.js` `similarity`) are Jaccard over facets.

**Docs and issues**

- Planned but not built: `POST /api/downloads/bundle`, Pac-level ownership, a "scanner between pending and published", R2 reconciliation, paid storage.
- Issue #46 is in progress. No pack issue exists.

**Tests**

- `test/unit`, `test/api/*.suite.js` (discovery timing on 3,000 products), `test/browser` (Playwright). No benchmarks.

**Compatibility that must hold:** see section I.

---

## B. Recommended architecture [R]

### What changed from rev. 2

Heavy work moves from the creator's browser to a **server Container running the Rust engine natively**.

- The browser runs the uploader and review UI, plus (rev. 4) the same engine as WebAssembly for instant listing, per-file upload and revision dedup (below). The Container is still the authority.
- Pages Functions stay the application and authority layer (JS).
- A new small **engine Worker** (JS) owns the Container and the job queue.

```
BROWSER (Pack Builder, plain JS)
  │ 1 POST /api/packs/:pac/versions {origin, files[] or zip}    → version (draft), upload plan
  │ 2 PUT  /api/packs/uploads/:id/parts/:n  (≤64 MiB parts, R2 multipart via Worker)
  │ 3 POST /api/packs/versions/:v/process                       → job queued
  │ 4 GET  /api/packs/versions/:v  (poll every 2–5 s)           → progress, then results
  │ 5 PATCH edits (moves, values) · POST publish / submit
  ▼
PAGES FUNCTIONS: server/ (JS, authority: auth, quota, D1 pack tables, publish, downloads)
  │ Queue producer (allowed in Pages) ── job {jobId, versionId, contractVersion}
  ▼
ENGINE WORKER: workers/engine/ (JS, ~200 lines: queue consumer + Container DO)
  │ retries / dead-letter queue / max concurrency · DO per job · alarm = timeout/stale guard
  ▼
CONTAINER: engine/ (Rust, native binary, basic: ¼ vCPU, 1 GiB; one job at a time; sleeps after 30 s)
  reads incoming/<version>/… via the engine Worker (no keys)  ─┐
  zip.list → stream inflate each entry → sha256+crc32 →        │ originals written to R2 FILES
  identify → facts → naming/classify → bpm/key/peaks →         │ (blobs, byte-exact)
  writes result.json (contract v1) to R2 jobs/<jobId>/          ┘
  │ completion POST → engine Worker → D1 processing_jobs.status = done
  ▼
PAGES server/packs/ imports result.json into pac tables (idempotent), version → ready

CUSTOMER: POST /api/downloads/bundle → token → Pages streams store-only ZIP64 (headers from stored CRC/size,
          R2 bodies passed through untouched) — no Container involved in downloads
```

### Rev. 4: the same engine also runs in the browser (WebAssembly) [R]

The engine's I/O-free modules (`zipread`, `hash`, `formats`, `facts`, `naming`, `classify`, `diff`) build twice from the same crate:

- a native binary for the Container;
- `engine-web.wasm` (`wasm32-unknown-unknown`, hand-rolled C-ABI loader, no wasm-bindgen; target ≤400 KB gz) for 2–4 Web Workers in the Pack Builder.

`analysis` (decode/DSP) stays native-only, to keep the browser download small.

| Browser does (free CPU, before upload) | Why it helps | Server still does (authority) |
| --- | --- | --- |
| Reads the ZIP central directory via `Blob.slice` (no full load) → tree and problems (unsafe paths, encrypted, unsupported, collisions) in about a second | Usability: the creator sees mistakes before uploading GBs | Re-applies every guard to what was actually uploaded |
| Stream-inflates each entry, SHA-256 + CRC32, identify, header facts, suggestions | Uploads **each original file** instead of the ZIP. Resumable per file; no temporary ZIP in R2 | Single puts carry `sha256`, so R2 rejects any mismatch. The Container re-derives facts and analysis |
| Asks "which of these hashes do you already have?" | **Revisions upload only changed files** (saves bandwidth, R2 operations and Container minutes inside the $5 plan) | Dedup is per creator only (no cross-tenant oracle) |
| Revision diff preview | The creator sees the changes immediately | Container `diff` is authoritative at submit |

- **Fallback:** if the WASM can't load (old browser, locked-down device), the whole ZIP is uploaded and the Container unpacks it. Same contract, same result.
- **CSP:** add `'wasm-unsafe-eval'` to `/studio` and `/admin` only. Phase 0 checks that `_headers` applies to these Function-served pages.

**Why this split**

- Containers can't be bound to Pages directly as a consumer, and Pages can't consume Queues [V].
- A separate Worker is therefore required, but it stays a thin adapter. All product logic stays in `server/`.

**Responsibilities**

| Layer | Language | Owns |
| --- | --- | --- |
| Browser | JS (IIFE) | Upload (parts, resume, progress), review UI, edits. Inheritance display uses the same JS resolver as the server (js/pack-resolve.js, run in the browser and Node like `stacc-model.js`) |
| Pages Functions `server/` | JS | Auth, authorization, quotas, version state machine, D1 writes to pack tables, importing results, publish batch, derived facets, bundle streaming (ZIP headers in JS: simple I/O framing, ~150 lines) |
| Engine Worker `workers/engine/` | JS | Queue consumer, Container lifecycle (one DO per job), timeouts, completion callback, `processing_jobs` status only |
| Container `engine/` | **Rust** | Everything CPU-heavy in the contract: archives, formats, facts, hashing, classification, analysis, diff, deflate variants; later previews |

**Engine modules** (Rust crate `engine/`, one binary `autostacc-engine`; each module has its own tests):

| Module | Notes |
| --- | --- |
| `io` | R2/S3 range reader and streaming multipart writer; the only module with network I/O |
| `zipread` | EOCD/ZIP64, CP437/UTF-8, streaming inflate, guards (section 11) |
| `hash` | SHA-256 + CRC32 |
| `formats` | Magic + structure; extension is only a hint |
| `facts` | WAV/RF64/BW64 (fmt/data/ACID/smpl/LIST), AIFF/AIFC, FLAC, MP3 (ID3, Xing), OGG, MIDI (format, PPQ, tempo, time signature, key, bars), presets/DAW by signature |
| `naming` | Path tokens via the vocabulary synonyms passed in the job |
| `classify` | Evidence → value + confidence + reasons; no taxonomy compiled in |
| `analysis` | Decode (symphonia), BPM with bar-consistency check, key (chroma + profiles), waveform peaks, compressibility probe |
| `diff` | Revision matching; hash first, never name-only |
| `pack` | Per-entry compression policy, deflate variants |
| `job` | Contract v1 entry point: `process-version`, `import-legacy`, `make-variants` |

**Synchronous vs asynchronous**

- **Asynchronous** (job, progress polled): processing a version, legacy import, deflate variants.
- **Synchronous:** create a version, upload parts, edits, publish (one D1 batch), bundle token and stream.
- Publishing never waits on analysis: a version becomes publishable once integrity and facts are done (job stage 1). Analysis suggestions (stage 2) can arrive later and only add suggestions.

**Jobs: best-practice reliability [R]**

- `processing_jobs(id, version_id, kind, contract_version, status queued|running|done|failed|cancelled, attempt, lease_until, progress JSON, error, result_key, created_at, updated_at)`.
- Idempotent: the job id is derived from (version, kind, input hash). A re-run overwrites the same result keys, and importing results is upsert-only.
- Queue retries 3× with backoff, then a dead-letter queue, which marks the version failed with a reason. The DO alarm kills runs past the time budget (stale-job protection). The CAS on `status` blocks duplicate consumers.
- Failure never touches the live version.

### Replaceability (owner requirement) [R]

**1. The engine is replaceable by contract, not by code.**

- engine/contract/v1/ holds JSON Schemas for each job's input and `result.json`, plus an error code list.
- engine/conformance/ holds golden fixtures: input pack + expected `result.json`, including malicious and edge cases.
- Any replacement engine, in any language, must pass node scripts/engine-conformance.js <command> before it is deployed.
- The app never reads engine internals, only contract fields.
- Breaking changes create `v2`, served side by side; every result records `contractVersion` and `engineVersion`.

**2. Features are separable by flags and boundaries.**

- data/features.js (or `site.js`) switches: `packs.analysis`, `packs.revisions`, `downloads.bundles`, `downloads.deflate`, `store.derivedFacets`, `product.contentsTree`.
- Each feature is a separate server module or route group, and each one degrades cleanly when off:
  - analysis off → no BPM/key suggestions;
  - bundles off → sequential links, as today;
  - derived facets off → creator facets only.
- Uploads, purchases and single-file downloads never depend on any flagged feature.

**3. The engine sits behind one seam:**

- server/packs/engine-client.js (enqueue, status, read result) is the only code that knows about Queues, Containers or the engine Worker.
- Replacing the Container with another runner (a VM, another cloud, a WASM build) changes that file and `workers/engine/`, nothing else.

**4. Data outlives the engine.**

- Facts, values and published snapshots are plain D1 rows with `engine_version`.
- Re-running a newer engine updates suggestions and facts, but never creator values.

---

## C. Language decision [R]

### Server-side engine language (native in a Container)

| Candidate | For | Against | Verdict |
| --- | --- | --- | --- |
| **Rust** | Memory-safe parsing of untrusted archives and audio. Single static binary → small image, fast cold start, low memory. Streams GB files with bounded memory. Permissive libraries: symphonia, midly, miniz_oxide/zlib-rs, sha2, crc32fast, rustfft, tokio + aws-sdk-s3 or rusty-s3. Same code can later compile to WASM for a browser preview | BPM/key DSP written in-house (~500 lines); team must know Rust | **Selected** |
| C++ | Mature native libraries (libsndfile, zlib, libarchive); fast | Memory-unsafe parsers of hostile input (long CVE history). Best audio-analysis libraries are GPL/AGPL (aubio, essentia). CMake/vcpkg upkeep | No |
| Python (numpy + librosa) | Best ready-made audio analysis (ISC licence); fast to prototype DSP | Large image (~500 MB+) → slow cold start and more memory. Slower archive and hash work; C extensions underneath anyway; GIL | No, although it could be a future *conformant replacement* of the analysis job if Rust DSP accuracy disappoints |
| Go | Good streaming, stdlib zip/crypto, simple deploys | Weak audio decoding and DSP ecosystem; would need cgo to C libraries | No |
| Node/JS in the Container | Same language as the site | Slow for DSP and hashing on GBs; the brief wants a dedicated engine | No |

**Native tools allowed beside it** [R]: `ffmpeg` (LGPL build) only later, for per-file preview encoding. It's an off-the-shelf binary called by the engine, not a second engine language.

### Language map on the server

| Where | Runs | Language |
| --- | --- | --- |
| Pages Functions (`server/`) | V8 isolates | **JS**, unchanged. Workers also support TypeScript, Python and Rust (WASM), but rewriting the site is out of scope |
| Engine Worker (`workers/engine/`) | V8 isolate | **JS**: a thin adapter, same conventions as `server/` |
| Container | Linux | **Rust** binary |

### Proof-of-concept uncertainties (Phase 0)

- Container cold start and image size (target: image <50 MB, cold start <5 s).
- R2 throughput from the Container (built: reads relayed by the engine Worker from its R2 binding; measured on deploy).
- Native SHA-256 ≥1 GB/s and inflate ≥300 MB/s per vCPU.
- symphonia covers the needed codecs.
- Queue → DO → Container wiring from a Pages producer.
- Local dev story (`wrangler dev` for the engine Worker with containers needs Docker; the API tests use a mock engine, below).

---

## D. Data model [R]

Migration db/migrations/0014_packs.sql (forward-only).

| Table / change | Key columns | Notes |
| --- | --- | --- |
| `stacclets`, `pacs` | id, project_id/stacclet_id, title, description, draft, source; `pacs.live_version_id`, `draft_version_id` | Synced from `data/` by `scripts/lib/platform-catalog.js` (`catalog`), plus Studio-made ones |
| `pac_versions` | id, pac_id, number, origin (zip\|files\|revision\|import), base_version_id, status, idempotency_key UNIQUE, stats JSON, created_by, reviewed_by, review_note, published_at | Status: draft → uploading → processing → ready → (in_review) → published → superseded; or failed / discarded. CAS transitions |
| `uploads` | id, version_id, kind (zip\|file), r2_key (`incoming/…`), upload_id, size, parts JSON, status | Incoming originals or ZIP before processing; deleted after publish or discard |
| `processing_jobs` | see B | Owned by the engine Worker (status) and server/packs (create/import) |
| `blobs` | id, owner_scope, sha256, crc32, size, r2_key UNIQUE, format, facts JSON, compress_ratio, engine_version, created_at, released_at | UNIQUE(owner_scope, sha256): per-creator dedup, no cross-tenant oracle |
| `assets` | id (as_…), pac_id | Stable identity across versions |
| `pac_folders` | id (stable), version_id, parent_id, name, sort, original_path | |
| `pac_folder_values` | folder_id, version_id, field, value, set_by | Explicit folder defaults |
| `pac_entries` | version_id, asset_id, folder_id, filename, original_path, blob_id, sort, state, error | The manifest; UNIQUE(version_id, folder_id, lower(filename)) |
| `asset_values` | asset_id, field, value, origin (embedded\|filename\|folder-name\|analysis\|rule\|creator), confidence, status (suggested\|accepted\|rejected), basis_blob_id, engine_version, set_by | |
| `product_files` + | asset_id, blob_id, version_id, folder_path, meta JSON | `meta` = published snapshot |
| `product_facets` + | origin DEFAULT 'creator' | Derived rows rewritten at publish |
| `creators` + | files_quota_bytes (NULL → 500 MB) | |
| `download_bundles` | id, subject, file_ids JSON, layout_hash, expires_at | |

**Layers kept separate**

| Layer | Stored in |
| --- | --- |
| Original path | `original_path` |
| Logical folder | `folder_id` + `filename` |
| Detected facts | `blobs.facts` (immutable, tied to bytes) |
| Embedded claims | `asset_values.origin='embedded'` |
| Inferred values | origins analysis/rule/filename/folder-name, `suggested` |
| Creator claims | origin `creator` |
| Inherited defaults | `pac_folder_values` (resolved, never copied) |
| Published metadata | `product_files.meta` + derived `product_facets` |

**Resolution** (js/pack-resolve.js, shared browser/server; plain logic, so not engine work):

1. Creator value on the asset.
2. Nearest folder default.
3. Accepted suggestion (auto-accepted above a measured confidence threshold, `set_by='auto'`).
4. Otherwise empty.

Facts can't be overridden; disagreements are flagged. Moves and renames never change explicit values, and the UI previews inherited changes before confirming. Retired vocabulary values become warnings and are never silently dropped from creator data.

**Versioning:** unchanged assets keep their blob **and their `product_files.id`**, so file ids, selections and logs stay stable. Changed assets get a new row; the old one is retired at publish.

**Migration risks:** legacy files are untouched until "Import existing files" (a job); `samples` folds to `one-shots` via synonyms; `product_files.r2_key UNIQUE` is preserved (one live row per blob per product).

**D1 limits [V]** (100 bound parameters per statement, 2 MB per value, 1,000 queries per invocation on Paid): result import and publish use set-based SQL (`INSERT … SELECT FROM json_each(?)`, `INSERT … SELECT FROM pac_entries`), so 2,000 assets is a handful of statements. Results larger than 2 MB are imported in pages.

## Canonical vocabulary [R]

- Extend `server/discovery/vocabulary.js`, the existing single source:
  - `kind`: one-shots, loops, stems, midi, presets, sample-libraries, project-files, documents, images, video, other (`samples`→one-shots)
  - `midi-role`: pattern | arrangement
  - `instrument`
  - `sample-rate`, `bit-depth` as facets
  - the full `format` list
  - synonym fixes (`serumpreset`, `vital-preset`)
- `data/content-types.js` is generated from it. `FILE_TYPES` is checked against it by a unit test.
- The engine receives the vocabulary (JSON) in each job; it never hard-codes taxonomy.

---

## E. Processing inventory [R]

| Operation | Today | Engine module | Placement | Reason | Performance | Risks |
| --- | --- | --- | --- | --- | --- | --- |
| ZIP listing + safety | none | `zipread` | Container | Untrusted, GB-scale | Range read of the central directory: ms | Malicious archives (section 11) |
| Inflate + store originals | none | `zipread`, `io` | Container | Workers can't (128 MB, CPU) | Streaming, ~300 MB/s per vCPU | Container egress cost (G) |
| SHA-256/CRC32 | none | `hash` | Container (+ R2 single-put check for loose files) | Integrity | ≥1 GB/s native | — |
| Format identification | `policy.js` `SIG` (16 bytes, sync at upload) | `formats` | Container (authoritative); `policy.js` keeps the fast allow-list/signature check at upload | Structure, not just magic | µs | Two checks, but different jobs: gate vs truth |
| Technical facts | none | `facts` | Container | Binary parsing of hostile input | ms per file | — |
| Naming + classification | `stacc-model.js` `kindOf` (extension) | `naming`, `classify` | Container | One classifier | ms per pack | Vocabulary passed in |
| BPM/key/peaks, compressibility probe | none | `analysis` | Container (stage 2) | Heavy decode | Bounded: ≤30 s of audio per file, loop/tonal candidates only | Accuracy (Phase 8) |
| Revision diff | `replaces=` only | `diff` | Container | Thousands of entries | ms | Fuzzy matches need confirmation |
| Deflate variants | none | `pack` | Container (flagged) | Only small, compressible files | Bounded | — |
| Legacy import (hash existing files) | none | `job import-legacy` | Container | GB reads | Streaming | — |
| ZIP listing, per-file extraction, hashing, header facts, suggestions, diff preview (rev. 4) | none | same modules, WASM build | **Browser** (Web Workers) before upload; Container re-verifies | Instant feedback, per-file upload, revision dedup | Targets: tree <1 s for 5k entries, ≥200 MB/s inflate+hash in Chrome | Browser differences: Phase 0 benchmarks Chrome, Firefox, Safari; ZIP-upload fallback |
| Inheritance resolution | none | — (JS `pack-resolve.js`) | Browser + server | Simple logic, needed live in the UI | µs | Parity test browser vs server |
| Bundle ZIP framing | none | — (JS server/downloads/zip.js) | Pages | Pass-through I/O, no compute; streaming stays in Workers (no duration limit while the client is connected [V]) | Header bytes only | Verified by the engine's `zipread` in CI |
| Derived facets/search | `facets.js`, `searchText` | — | Pages at publish | DB-bound | One set-based statement | — |
| Recommendations (`rank.js`), search, stats | JS/SQL | — | stays | Not CPU-heavy at this scale (tens of ms) | — | FTS5 is #97 |
| Build hashing, `sniffImage` | Node / JS | — | stays | Trivial; build stays dependency-free | — | — |
| Library views (`stacc-model.js`) | JS Web Worker | — | stays (extended) | UI state | — | — |

---

## F. Phased plan

**Smallest end-to-end slice = Phases 0–3:**

1. Admin uploads a ZIP for a first-party product.
2. The Container stores byte-exact originals with facts.
3. Admin publishes.
4. The library shows folders.
5. A buyer downloads a folder as a ZIP, and every file's SHA-256 equals the source.

| Phase | Objective | Changes / new | Acceptance |
| --- | --- | --- | --- |
| **0. Platform proof of concept** (~3–5 days) | Prove the Container path, its cost inside the $5 plan, and record the decision | server/usage/ budget meters; `workers/engine/` + Container DO + Queue (dev/preview/prod) via `scripts/cloudflare.js`; minimal Rust `zipread`+`hash`+`io`, built both natively and as `engine-web.wasm` (loaded in a browser Web Worker, `'wasm-unsafe-eval'` CSP check on `/studio` and `/admin`); R2 access from the Container (S3 token vs FUSE); bench harness test/bench/ (generated 2 GB / 1,500-file pack, 10k-entry ZIP, 1.5 GB RF64) | Cold start, throughput, cost per GB measured; `docs/decisions.md` + docs/engine.md record Rust and the infrastructure; Docker and local dev documented |
| **1. Contract + vocabulary + schema** | The seams before the code | `engine/contract/v1/*.json`, engine/conformance/ fixtures + scripts/engine-conformance.js; vocabulary extension; `data/content-types.js` generated; `0014_packs.sql`; Stacclet/Pac sync; `LIMITS` 500 MB; features file; **mock engine** (test/mock-engine/, JS, returns fixture results) so API tests run without Docker | Unit tests; `build.js --check`; existing suites green |
| **2. Engine core** | Trusted processing | `zipread` guards, `formats`, `facts`, `naming`, `classify`, `job process-version` stage 1 | `cargo test`, `cargo fuzz` targets, conformance passes. **Built (2026-10-10):** guards, formats, facts, `naming` and `classify` (suggestions with origin, confidence and reasons, from the vocabulary sent with each job), conformance (27 checks, CLI = WebAssembly). Fuzz targets (archives, headers, names; weekly in CI). `process-version` arrives with Phase 3's pack tables |
| **3. Upload → process → publish → bundle (vertical slice)** | First real value | server/packs/ (versions, uploads with R2 multipart via the binding, process, import results, edits, publish), server/packs/engine-client.js; `server/files/upload.js`/`buckets.js` (multipart); server/downloads/bundle.js + `zip.js`; `/api/library` `folderPath`; `stacc-model.js` folder level; minimal builder UI (js/pack-builder.js, `-upload.js`, `-tree.js`, js/engine/engine-client.js + `engine-worker.js`: list the ZIP in the browser, upload each file with its SHA-256, whole-ZIP fallback) in the admin | API suite `packs.suite.js` (404s, idempotency, failed job leaves live intact, publish atomicity); browser E2E byte-equality; refund rule after a bundle download |
| **4. Review UI + inheritance** | Guided automation | js/pack-resolve.js, `-review.js` (exceptions first, "auto" with reasons, bulk edit, folder defaults, move preview), `asset_values`/folder-values routes | Inheritance matrix tests; E2E correction and move keep explicit values |
| **5. Studio creators + automated review** | Open to creators | Studio entry in `js/studio-products.js`; Pac/Stacclet auto-create; quotas (reservation at version create, race-proof); **automated review** replaces the per-file pending flow, as the documented "scanner between pending and published" | Quota race; auto-pass publishes; each red flag holds with its reason; admin override audited; impersonation refused |
| **6. Revisions** | Safe replacement | `diff` in the engine; `-versions.js` review; blob dedup (git-style, by SHA-256); carry-over; removed or replaced files kept 30 days for buyers then swept (engine Worker cron, allowed in a Worker); measure whether deltas inside files would save space; buyers' "Updated" badge + removed-files list for 30 days (`pac_versions.stats.removed`, shown by `js/library-view.js`) | Diff matrix; unchanged files keep ids; failed revision leaves live intact |
| **6b. Personal organization** (first release) | Collections, personal tags, saved searches in Your Stacc | server/collections/ (new module): `collections(id, user_id, name, created_at)`, `collection_items(collection_id, asset_id, added_at)`, `asset_tags(user_id, asset_id, tag)`, `saved_searches(user_id, name, query)`; items reference the stable `asset_id`, so they survive revisions (a removed asset shows as "no longer in the pack"); only owned assets are ever listed; `stacc-model.js` filter by collection/tag; included in the account data export and deleted with the account (`server/account/`); `/privacy` updated | Suite: another user's collection is 404; non-owned assets never listed; export and delete cover the new tables; creator metadata untouched |
| **7. Store integration** | Contents-driven discovery | Derived facets at publish; `GET /api/products/:id/contents`; product page tree; new filters through `product_facets` | Product qualifies on ≥1 asset; drafts excluded; creator facets survive; search timing within ±20% |
| **8. Analysis** | BPM/key/peaks suggestions | `analysis` (stage 2); labelled set; threshold calibration | Accuracy report; inferred values never shown as verified |
| **9. Hardening, migration, docs** | Release | Legacy import job; creators can download their own originals (vision §10); deflate variants (flag); weekly fuzzing; perf suite; `/privacy` (`data/legal.js`) + creator wording ("checks files for type, not content" changes); `docs/packs.md`, `docs/engine.md`, updated `architecture.md`, `store.md`, `library.md`, `creators.md`, `discovery.md`, `development.md`, `decisions.md`; issues for deferred work | Section I |
| **10. Optional** | — | Per-file audio previews (ffmpeg in the Container), MIDI previews, audio fingerprinting for automated review | Each gated by need |

Reviews: `architect` before Phase 3; `security-reviewer` + `backend-reviewer` after 3, 5, 6; `frontend-reviewer` after 3, 4, 6.

---

## Section 8: compression and packaging [R]

| Layer | Policy |
| --- | --- |
| **Stored originals** | Exactly as uploaded; no at-rest compression. Audio dominates and barely deflates (WAV ~3–10%); FLAC, MP3, OGG, ZIP, `.als` and images are already compressed |
| **Transport ZIP** | Standard ZIP/ZIP64. **Store** by default (zero CPU, exact Content-Length). **Deflate** only when the measured probe ratio ≤0.8 and size ≤8 MB (MIDI, text, JSON/XML presets), using variants made once by the engine, stored as derived objects and verified by inflate + re-hash. Behind a flag |
| **Previews** | Separate `PREVIEWS` bucket, never replacing originals |
| **Never** | Transcoding, resampling, bit-depth or channel changes, rewriting MIDI/presets/projects, recompressing archives |

**Integrity chain**

1. Upload: the ZIP or files go to `incoming/`, multipart parts carry ETags.
2. Container: inflates each entry, hashes it, writes the original to `FILES`, then re-reads its length and checks the CRC.
3. `blobs` gets sha256 + crc32.
4. Unchanged files keep their blob across versions.
5. Single downloads stream the original object.
6. Bundles embed the original bytes with the stored CRC (unzip tools verify it).
7. The library shows SHA-256.
8. The E2E test compares hashes.

**Delivery and caching** (brief: "deliver individual files directly, prebuild or cache common packages, generate custom archives on demand")

- **Single files:** streamed directly, as today.
- **Custom selections and folders:** generated on demand as store-only ZIPs from precomputed CRCs and sizes. That's deterministic (same input → same bytes), costs almost no Worker CPU, and gets an `ETag` (version + file list), so browsers and download managers can reuse and resume them.
- **Full-pack ZIP** (the common package): **prebuilt only behind the flag `downloads.packCache`**.
  - Built once per published version from the same layout, stored as a derived object, and verified by CRC.
  - Reused until the version changes; deleted with it.
  - Off by default: with store-only packaging, a cached copy saves no CPU and doubles the pack's R2 storage, which matters inside the 10 GB free allowance.
  - Phase 9 measures streaming vs serving the cached object (time to first byte, Worker CPU per GB) and switches it on only if streaming proves slower in practice, or once deflate variants make on-demand building costly.

## Section 9: library and selective downloads [R]

- `POST /api/downloads/bundle {fileIds}` covers a folder, Pac, product, or a selection within or across products, Stacclets and projects.
- Each file is checked through the existing per-product entitlement access; the request is never trusted.
- Limits: 2,000 files and 20 GB per bundle.
- One `download_events` row per file, so the refund rule holds.
- Layout: `Project/Stacclet/Pac/<folders>/<file>`; a single-Pac bundle drops the outer levels. Names are sanitized for every OS; case collisions get ` (2)` in deterministic order.
- Licences permit partial download [V]. A product type that must download whole would be one flag.
- Library: folder tree; filters for folder, BPM range, key, instrument and kind; sorts by name, date, duration and BPM. All kept in the URL, which acts as saved searches.
- Personal collections, personal tags and named saved searches: Phase 6b (first release); they never change creator metadata or hierarchy.
- Previews at launch: duration, BPM/key/format badges, waveform peaks, existing product clips. Deferred: per-file audio and MIDI previews.

## Section 10: search, facets, recommendations [R]

- Derived at publish from published `product_files.meta`; drafts are never counted:
  - kind/contents, instrument, format, key, daw, plugin
  - sample-rate, bit-depth
  - `bpm_min/max`
- A product qualifies when ≥1 eligible asset matches. Counts per value go in `products.metadata.contents` for the product page.
- The existing index `product_facets_value` serves the new facets. Recompute is incremental per product at publish; the public cache stays 60 s.
- Recommendations benefit automatically through `rank.js similarity`, with one review of `weights.js`.

## Automated review (owner: "the goal is automated review") [R]

The engine's job result includes a `review` block (contract v1): `verdict pass | hold`, plus `flags[]` with a code, the file and a reason. server/packs/ applies the policy:

- **pass** → publishes when the creator presses Publish, for trusted and untrusted creators alike;
- **hold** → `in_review`, `alertAdmins` with the flags; the admin approves or rejects (audited).

The admin can mark a creator "always hold" (per-creator setting). Trusted creators skip soft flags.

| Flag | Hard (always hold) | Soft (hold unless trusted) |
| --- | --- | --- |
| Integrity | Hash/CRC mismatch, truncated or corrupt file, content ≠ extension | — |
| Safety | Executables/scripts inside nested archives, encrypted archives, unsafe paths | — |
| Content sanity | — | Silent or near-empty audio, all files duplicates of another pack by the same creator, >50% unknown formats, large share of files failing to decode |
| Revision risk | — | Revision replaces >50% of bytes or removes >25% of files |

**What automation can't judge:** whether the creator owns the rights to the sounds, or their quality. That stays with the existing reporting/takedown process and admin spot checks. Audio fingerprinting against other creators is out of scope and listed as a future option.

## Section 11: security and reliability [R]

**Archive guards (`zipread`, in the Container; nothing is ever executed)**

- Paths are normalized (NFC, `\`→`/`). Rejected: `..`, absolute paths and drives, control characters, depth >32, path >1,024 bytes.
- Symlinks and special entries are refused.
- Encrypted entries are reported "password-protected".
- Limits: entries ≤10,000; declared vs actual sizes must match; ratio >200:1 refused; total expanded ≤ remaining quota (creators) / 50 GB (admin).
- Duplicate or case-colliding names are reported.
- Nested ZIPs are kept as files, with their listing inspected.
- Deceptive files are refused.
- The Container holds no secrets and has no internet or D1 access: storage reads (and, from Phase 3, writes of blob keys) go through the engine Worker, which answers from its R2 binding for allowed buckets and keys only. Per-job time and memory budgets apply.

**Server**

- Paths never become R2 keys.
- Incomplete multipart uploads are auto-aborted after 7 days by R2 [V] and sooner by the sweep.
- Abandoned drafts are discarded after 30 days.

**Authorization**

- Drafts are visible only to the creator's members and admins (404 otherwise).
- The contents endpoint covers published products only.
- Bundle tokens follow the download pattern (HMAC, bound to the subject, 5 minutes, re-checked).

**Reliability:** idempotency keys, CAS states, queue retries + dead-letter queue, DO alarm timeouts, upsert-only imports, publish as one D1 batch (all or nothing), the previous version live until commit.

## Section 13: performance [R]

**Benchmarks** (Phase 0, re-run in Phase 9)

- 2 GB / 1,500-file pack; 10k-entry ZIP; 1.5 GB RF64
- facts across formats; analysis per loop
- bundle of 2,000 files
- revision with 95% unchanged files
- result import of 2,000 rows; publish batch
- search with 3,000 products + derived facets; library with 5,000 assets
- Container cold start; Worker CPU per request

**Initial targets** (revised from measurements)

- upload limited only by the creator's bandwidth
- processing a 2 GB pack <3 min on standard-2
- result import + publish <3 s
- bundle time to first byte <500 ms
- search p95 within ±20%

---

## Reality check: what works, what doesn't, limits, best practices, effort

### Cloudflare [V unless marked]

| Service | Works well for | Limits that shape this design |
| --- | --- | --- |
| **Pages Functions** (current API) | Auth, D1, small requests, streaming downloads (no duration limit while the client is connected) | 128 MB memory; CPU 30 s default / 5 min max on Paid; **100 MB request body** (Free/Pro) → uploads go in parts; **cannot consume Queues, no cron**; can produce to Queues, bind DOs (via `script_name`) and service bindings |
| **Workers** (new engine Worker) | Queue consumer, Container orchestration, cron sweeps | Queue consumer/cron runs ≤15 min (the Container does the long work; the Worker only coordinates) |
| **Containers** | Native CPU and memory for GB archives and DSP; any Linux binary | Workers Paid only. Up to 4 vCPU / 12 GiB / 20 GB disk per instance. Billed per provisioned memory/disk-second and active CPU; egress beyond 1 TB/month billed ($0.025/GB NA/EU). Cold starts of seconds [A]; GA status not confirmed [A]; local dev needs Docker |
| **Queues** | Retries, dead-letter queue, concurrency limits | Producer from Pages OK; consumer must be a Worker |
| **D1** | Pack metadata | 100 bound parameters, 100 KB SQL, 2 MB per value, 1,000 queries per invocation, 10 GB database → set-based SQL, paged imports |
| **R2** | Originals (no egress fees to customers), multipart (uniform parts, auto-abort after 7 days), range reads, put-time SHA-256 check | Class A operations $4.50/M (each part/put), storage $0.015/GB-month; no server-side "unzip" |

### Browser

| Works | Doesn't / limits |
| --- | --- |
| Large file selection and folder drop (`webkitdirectory`), `Blob.slice` for parts | Streaming request bodies (Safari/Firefox) → upload Blob parts |
| Upload with resume (parts tracked server-side, re-select file after a reload) | A closed tab stops uploading (processing continues on the server once uploaded) |
| Progress per part and file; Web Workers keep the UI smooth | Phones are not a target for building packs (memory, file pickers) |
| | Background upload after closing the tab is not possible without a native app |

### Staying inside the $5 Workers Paid plan (owner: "try not to charge me") [V amounts, R design]

**Included per month** (Cloudflare pricing pages, checked this session):

| Service | Included | What this design uses | Headroom |
| --- | --- | --- | --- |
| Workers | 10M requests, 30M CPU-ms | API + upload parts + bundle streams (pass-through, low CPU) | Large |
| Containers | 25 GiB-h memory, 375 vCPU-min, 200 GB-h disk, 1 TB egress | `basic` instance: memory-bound at **~25 h/month** (CPU allows 25 h busy, disk 50 h). Estimate [A, Phase 0]: a 2 GB pack ≈ 3–6 min → roughly **250–500 packs/month** | Good for launch volume |
| Durable Objects (one per job) | 1M requests, 400k GB-s | A few per job | Large |
| Queues | 1M operations | ~3–5 per job | Large |
| D1 | 25B rows read, 50M written, 5 GB | ~2–3 rows written per asset per version | Large |
| **R2** | **10 GB-month storage**, 1M Class A, 10M Class B | Originals + temporary incoming uploads; 2,000-file pack ≈ 2,000+ Class A | **Storage is the tight one** |

**Rules that keep it free**

1. **Billing stops when the container sleeps** [V]. Jobs run one at a time on `basic`, with `sleepAfter` 30 s and a queue concurrency of 1. Nothing keeps the container warm.
2. **Don't pay to process twice:**
   - unchanged files in revisions are skipped (hash dedup);
   - analysis runs only on loop/tonal candidates, first 30 s of audio;
   - the incoming ZIP is deleted as soon as its files are verified (R2 bills by GB-month, so hours of temporary copies cost almost nothing).
3. **Cheap work stays off the container:** downloads, bundles, edits, search and resolution run in Pages, which costs almost nothing.
4. **Global storage budget:** creators' quotas (500 MB each) are promises against a shared 10 GB.
   - Admins see total use vs 10 GB.
   - New creator uploads are refused, with a clear message, once storing them would pass a configurable cap (default 9 GB total), until the owner raises it. Raising it costs $0.015 per GB-month.
   - This connects to the planned creator-paid storage.
5. **App-level budget guard** (server/usage/, new small module, since Cloudflare has no hard spending cap):
   - Keeps monthly meters in D1: container seconds × instance size (from job start/stop), R2 bytes stored, Class A operations.
   - At 80% of any allowance: admin alert, and the optional analysis stage is skipped (suggestions only from filenames and tags).
   - At 95%: new processing jobs wait in the queue with "processing resumes on the 1st" shown to the creator, unless the owner presses "allow spending this month" (audited).
   - Cloudflare's own billing notification is set as a backup alert ([store-setup](store-setup.md) step).
6. **Phase 0 measures real cost per GB processed** on `basic`, and the numbers go into `docs/decisions.md` before anything is enabled for creators.

### Best practices adopted

- **Original bytes:** content-addressed blobs, never transformed.
- **Jobs:** idempotent, retried, with a dead-letter queue.
- **Engine boundary:** sans-trust (server re-verifies everything it stores); a versioned JSON contract + conformance fixtures; feature flags with clean fallbacks.
- **Database:** set-based SQL within D1 limits.
- **Formats:** standard ZIP/ZIP64, no custom format.
- **Engine safety:** memory-safe language for hostile input; fuzzing.
- **Testing:** a mock engine so the existing fast test suites don't need Docker.

### What's too much work, or not worth it (kept out or deferred) [R]

- Per-asset purchasing / Pac-level ownership: the owner chose whole products.
- Keeping every old version of every file for buyers: too much storage (owner, H8); a removed or replaced file stays 30 days, then goes.
- Running heavy analysis (decode, BPM/key) in the browser: it stays Container-only; the browser build carries only listing, hashing, facts and suggestions.
- Stored, cached full-pack ZIPs: determinism makes them unnecessary.
- At-rest compression; deflate for audio.
- Machine-learning classification: evidence rules + measured thresholds first.
- Server-side audio preview generation in v1 (Phase 10, with ffmpeg).
- A TypeScript migration of the site.

### Honest costs/effort

The full scope is several weeks of work. The biggest items:

- Phase 0 infrastructure (Container + Queue + Worker + deploy scripts + local dev)
- engine core with guards and fuzzing
- the review UI
- analysis accuracy

The vertical slice (0–3) is the first point of real value.

---

## G. Risks and trade-offs

| Risk | Mitigation |
| --- | --- |
| Containers' maturity/GA and cold starts [A] | Phase 0 gate; the engine sits behind `engine-client.js` + contract, so the runner can be swapped |
| Container/R2 cost beyond the $5 plan | `basic` instance, one job at a time, sleep after 30 s; dedup; analysis skipped near the cap; server/usage/ budget guard (80% alert, 95% pause); global storage cap 9 GB of the 10 GB free R2; cost per GB measured in Phase 0 |
| `basic` instance too slow for big packs | Phase 0 benchmark; switch to standard-1 with one config line (fewer free hours: ~6/month) |
| WASM speed and memory differ between browsers | Engine works in bounded chunks (4 MiB) per Web Worker; worker count adapts; whole-ZIP upload fallback; Phase 0 benchmarks three browsers |
| Browser and Container results disagree | The Container's result always wins; a mismatch is logged with both engine versions and covered by a parity test on the conformance fixtures (WASM vs native) |
| Local development needs Docker | Mock engine for `npm run test:store`; Docker only for engine work and conformance |
| Multipart upload through the Worker (bytes pass through Pages) | I/O, not CPU; parts ≤64 MiB; alternative: presigned R2 URLs (needs bucket CORS + an S3 key in the browser flow), not chosen |
| Malicious archives | Rust, guards, fuzzing, no secrets in the Container |
| BPM/key accuracy | Suggestions only; measured thresholds; "no key" for atonal material |
| D1 limits | `json_each`, paged imports |
| A revision removes files buyers paid for but haven't downloaded (vision §6) | 30 days' notice in Your Stacc with the date, then removal (owner's decision H8) |
| Engine replacement | Conformance suite and contract versions |
| Maintenance in two languages (JS + Rust) | Rust confined to `engine/`; contract docs; CI builds the image and runs conformance |

---

## H. Clarifying questions (open)

Answered and folded into the plan: Container size and cap, notice to buyers on removed files, automated review, collections in the first release, what buyers keep after a revision (H8), and "One-shots" as the label (H5).

These remain open. Each has a default the plan uses unless you say otherwise.

**H6 · Extra formats**

- **Recommended default:** add Kontakt parts (`.nkm`, `.nkx`, `.nkc`, `.ncw`) and Bitwig (`.bwpreset`, `.bwclip`); nested ZIPs kept as files.
- **What changes:** the allow-list and the classifier rules.

**H7 · Limits**

- **Recommended default:** 2,000 files per version, 10,000 ZIP entries, files up to the quota, bundles of 2,000 files / 20 GB.
- **What changes:** constants only.

---

## I. Definition of done

- **Completeness:**
  - ZIP, loose files and folder import.
  - Review with corrections, folders, defaults, bulk edit.
  - Revisions with diff; publish and review.
  - Admin + Studio.
  - Library folders and filters; single, folder, Pac, selection and cross-product downloads.
  - Contents tree; derived facets.
- **Preserved behaviour:**
  - Checkout, payments and entitlements unchanged; download authorization per product.
  - `DELIVERABLE` semantics; stable file ids; refund rule.
  - Catalog sync owns only `catalog` rows.
  - Legacy files still delivered; preview clips unchanged; 404-for-not-yours; audit and impersonation rules.
- **Correctness:**
  - Byte-identical originals (SHA-256 E2E, single and bundle).
  - Facts only from parsed bytes; inferred values labelled.
  - Explicit values never lost on a move, rename or revision.
- **Security:** malicious corpus handled; drafts private; tokens tamper-proof; the Container is least-privilege; `security-reviewer` clean.
- **Replaceability:**
  - Conformance suite passes for the shipped engine.
  - The mock engine passes the same contract tests.
  - Each feature flag off → the site still works (tested).
- **Testing:** `cargo test`/`clippy`/fuzz smoke, conformance, `npm test`, `npm run test:store`, `seo-test.js`, `verify-site`, `release-check`.
- **Performance and cost:** targets met or revised with recorded numbers; cost per GB processed documented; a normal month of use stays inside the $5 Workers Paid allowance, and the budget guard is tested (80% alert, 95% pause, owner override).
- **Reliability:** resumable uploads; idempotent jobs; dead-letter queue → visible failure; failed revision leaves live intact; sweeps clean orphans.
- **Docs:** `docs/packs.md`, docs/engine.md (contract, how to replace the engine), decisions and privacy updated; deferred items opened as issues.
