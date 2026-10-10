// The engine as an HTTP service inside the server Container (native only). Only the engine Worker reaches it (through
// its Container Durable Object); nothing here is public. One job at a time per instance, matching the plan's budget.
//   GET  /healthz           → {"ok": true, "engineVersion": …}
//   POST /v1/jobs {op, source: {bucket, key}, path?}   op = list | inspect | file → the job contract's JSON
//   POST /v1/jobs {op: "process", source, target: {bucket, prefix}}  inspect, and write each accepted file's original
//        to <prefix><n> as it is read (one pass); each file's answer says where (`stored`)
// Local files ({source: {file}}) are accepted only with ENGINE_ALLOW_LOCAL=1 (development and tests).
use crate::classify::{self, Vocabulary};
use crate::job::Sink;
use crate::job::{self, Discard};
use crate::r2::{R2Config, R2Source, Upload};
use crate::source::FileSource;
use crate::zipread::Limits;
use crate::{Source, CONTRACT_VERSION, ENGINE_VERSION};
use serde::Deserialize;
use std::io::Read;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tiny_http::{Header, Method, Request, Response, Server};

#[derive(Deserialize)]
struct SourceRef {
    bucket: Option<String>,
    key: Option<String>,
    file: Option<String>,
}

#[derive(Deserialize)]
struct Job {
    op: String,
    source: SourceRef,
    #[serde(default)]
    path: Option<String>,
    /// The words to suggest values from (classify.rs); no suggestions without it.
    #[serde(default)]
    vocabulary: Option<Vocabulary>,
    /// Where `process` writes originals.
    #[serde(default)]
    target: Option<Target>,
}

#[derive(Deserialize)]
struct Target {
    bucket: String,
    prefix: String,
}

/// A prefix the engine may write under: relative, ending in `/`, no `..`, plain characters.
fn good_prefix(p: &str) -> bool {
    p.len() <= 200
        && p.ends_with('/')
        && !p.starts_with('/')
        && !p.contains("..")
        && !p.contains("//")
        && p.chars().all(|c| c.is_ascii_alphanumeric() || "-_/".contains(c))
}

/// Writes each accepted file to <prefix><n> as the engine reads it.
struct StoreSink<'a> {
    cfg: &'a R2Config,
    bucket: &'a str,
    prefix: &'a str,
    n: usize,
    current: Option<(String, Upload)>,
    ok: bool,
    done: Option<String>,
}

impl Sink for StoreSink<'_> {
    fn begin(&mut self, _path: &str, size: u64) {
        self.n += 1;
        let key = format!("{}{}", self.prefix, self.n);
        self.ok = true;
        self.current = Upload::start(self.cfg, self.bucket, &key, size).ok().map(|u| (key, u));
    }
    fn chunk(&mut self, b: &[u8]) {
        if let Some((_, u)) = self.current.as_mut() {
            self.ok &= u.write(b);
        }
    }
    fn end(&mut self, ok: bool) {
        self.done = match self.current.take() {
            Some((key, u)) if ok && self.ok => u.finish().ok().map(|_| key),
            Some((_, u)) => {
                u.abort();
                None
            }
            None => None,
        };
    }
    fn stored(&mut self) -> Option<String> {
        self.done.take()
    }
}

fn reply(req: Request, status: u16, body: serde_json::Value) {
    let header = Header::from_bytes("Content-Type", "application/json").unwrap();
    let _ = req.respond(
        Response::from_string(body.to_string())
            .with_status_code(status)
            .with_header(header),
    );
}

fn error(code: &str) -> serde_json::Value {
    serde_json::json!({ "error": code, "engineVersion": ENGINE_VERSION })
}

fn run(job: &Job, r2: Option<&R2Config>) -> (u16, serde_json::Value) {
    let started = Instant::now();
    let local = std::env::var("ENGINE_ALLOW_LOCAL").as_deref() == Ok("1");
    let src: Box<dyn Source> = match (&job.source, r2) {
        (
            SourceRef {
                bucket: Some(b),
                key: Some(k),
                ..
            },
            Some(cfg),
        ) => match R2Source::open(cfg, b, k) {
            Ok(s) => Box::new(s),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (404, error("not_found")),
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => return (403, error("bucket_not_allowed")),
            Err(_) => return (502, error("storage_unavailable")),
        },
        (SourceRef { file: Some(f), .. }, _) if local => match FileSource::open(std::path::Path::new(f)) {
            Ok(s) => Box::new(s),
            Err(_) => return (404, error("not_found")),
        },
        _ => return (400, error("bad_source")),
    };
    let limits = Limits::default();
    let result = match job.op.as_str() {
        "list" => job::list_archive(src.as_ref(), &limits)
            .map(|mut r| {
                if let Some(v) = &job.vocabulary {
                    classify::apply(&mut r, v)
                }
                serde_json::to_value(r).unwrap()
            })
            .map_err(|e| e.code),
        "inspect" => job::inspect_archive(src.as_ref(), &limits, &mut Discard)
            .map(|mut r| {
                if let Some(v) = &job.vocabulary {
                    classify::apply(&mut r, v)
                }
                serde_json::to_value(r).unwrap()
            })
            .map_err(|e| e.code),
        "process" => {
            let (Some(t), Some(cfg)) = (&job.target, r2) else {
                return (400, error("bad_target"));
            };
            if !good_prefix(&t.prefix) {
                return (400, error("bad_target"));
            }
            if !cfg.buckets.contains(&t.bucket) {
                return (403, error("bucket_not_allowed"));
            }
            let mut sink = StoreSink {
                cfg,
                bucket: &t.bucket,
                prefix: &t.prefix,
                n: 0,
                current: None,
                ok: true,
                done: None,
            };
            job::inspect_archive(src.as_ref(), &limits, &mut sink)
                .map(|mut r| {
                    if let Some(v) = &job.vocabulary {
                        classify::apply(&mut r, v)
                    }
                    serde_json::to_value(r).unwrap()
                })
                .map_err(|e| e.code)
        }
        "file" => job::inspect_file(job.path.as_deref().unwrap_or(""), src.as_ref())
            .map(|mut r| {
                if let Some(v) = &job.vocabulary {
                    r.suggestions = classify::suggest(&r, v)
                }
                serde_json::to_value(r).unwrap()
            })
            .map_err(|_| "io"),
        _ => return (400, error("unknown_op")),
    };
    match result {
        Ok(mut v) => {
            v["elapsedMs"] = serde_json::json!(started.elapsed().as_millis() as u64);
            (200, v)
        }
        Err(code) => (422, error(code)),
    }
}

/// Serves until the process is stopped. `R2_*` variables configure storage access (see r2.rs).
pub fn serve(addr: &str) -> ! {
    let r2 = R2Config::from_env();
    let server = Server::http(addr).unwrap_or_else(|e| panic!("cannot listen on {addr}: {e}"));
    eprintln!(
        "autostacc-engine {ENGINE_VERSION} (contract {CONTRACT_VERSION}) listening on {addr}; R2 {}",
        if r2.is_some() { "configured" } else { "not configured" }
    );
    let busy = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let r2 = std::sync::Arc::new(r2);
    for mut req in server.incoming_requests() {
        match (req.method(), req.url()) {
            (Method::Get, "/healthz") => reply(
                req,
                200,
                serde_json::json!({ "ok": true, "engineVersion": ENGINE_VERSION, "contractVersion": CONTRACT_VERSION }),
            ),
            (Method::Post, "/v1/jobs") => {
                let mut body = String::new();
                if req.as_reader().take(1 << 20).read_to_string(&mut body).is_err() {
                    reply(req, 400, error("bad_request"));
                    continue;
                }
                let Ok(job) = serde_json::from_str::<Job>(&body) else {
                    reply(req, 400, error("bad_request"));
                    continue;
                };
                if busy.swap(true, Ordering::SeqCst) {
                    reply(req, 503, error("busy"));
                    continue;
                }
                let (busy, r2) = (busy.clone(), r2.clone());
                std::thread::spawn(move || {
                    let (status, value) = run(&job, r2.as_ref().as_ref());
                    busy.store(false, Ordering::SeqCst);
                    reply(req, status, value);
                });
            }
            _ => reply(req, 404, error("not_found")),
        }
    }
    unreachable!("the server stopped accepting requests")
}

#[cfg(test)]
mod tests {
    #[test]
    fn write_prefixes_stay_plain_and_relative() {
        assert!(super::good_prefix("blobs/cr_abc/job123/"));
        for bad in [
            "blobs/x",
            "/blobs/x/",
            "blobs/../x/",
            "blobs//x/",
            "blobs/x y/",
            "blobs/é/",
        ] {
            assert!(!super::good_prefix(bad), "{bad}");
        }
    }
}
