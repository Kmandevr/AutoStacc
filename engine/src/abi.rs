// WebAssembly interface (wasm32 only): a tiny C-style ABI instead of generated bindings, so the same ~80-line JS
// loader (engine/js/engine-wasm.js) drives it from a browser Web Worker or Node. Bytes come from the host on demand
// (`host_read`: FileReaderSync over a Blob in a Worker, fs.readSync in Node), extracted originals go back through
// `host_sink`, and every call answers with JSON in the job contract.
use crate::job::{self, Discard, Sink};
use crate::zipread::Limits;
use crate::Source;
use std::cell::RefCell;

#[link(wasm_import_module = "env")]
extern "C" {
    /// Copies up to `len` bytes of source `src` at `offset` into `ptr`; returns the count, or a negative number on error.
    fn host_read(src: u32, offset: f64, ptr: *mut u8, len: u32) -> i32;
    /// Total length of source `src`.
    fn host_len(src: u32) -> f64;
    /// Extracted file events: 0 = begin (ptr/len = UTF-8 path), 1 = chunk of original bytes, 2 = end ok, 3 = end refused.
    fn host_sink(event: u32, ptr: *const u8, len: u32);
}

struct HostSource(u32);

impl Source for HostSource {
    fn len(&self) -> u64 {
        unsafe { host_len(self.0) as u64 }
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = unsafe { host_read(self.0, offset as f64, buf.as_mut_ptr(), buf.len() as u32) };
        if n < 0 {
            return Err(std::io::Error::other("host read failed"));
        }
        Ok(n as usize)
    }
}

struct HostSink;

impl Sink for HostSink {
    fn begin(&mut self, path: &str, _size: u64) {
        unsafe { host_sink(0, path.as_ptr(), path.len() as u32) }
    }
    fn chunk(&mut self, b: &[u8]) {
        unsafe { host_sink(1, b.as_ptr(), b.len() as u32) }
    }
    fn end(&mut self, ok: bool) {
        unsafe { host_sink(if ok { 2 } else { 3 }, std::ptr::null(), 0) }
    }
}

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn engine_alloc(len: u32) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len as usize);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr`/`len` must come from `engine_alloc`.
#[no_mangle]
pub unsafe extern "C" fn engine_free(ptr: *mut u8, len: u32) {
    drop(Vec::from_raw_parts(ptr, 0, len as usize));
}

#[derive(serde::Deserialize)]
struct Request {
    op: String,
    #[serde(default)]
    src: u32,
    #[serde(default)]
    path: String,
    #[serde(default)]
    emit: bool,
    /// [i, n]: inspect only this worker's share of the files.
    #[serde(default)]
    part: Option<(usize, usize)>,
}

fn run(req: &[u8]) -> Vec<u8> {
    let err = |code: &str| serde_json::to_vec(&serde_json::json!({ "error": code })).unwrap();
    let Ok(r) = serde_json::from_slice::<Request>(req) else {
        return err("bad_request");
    };
    let src = HostSource(r.src);
    let limits = Limits::default();
    // Serialized straight from the result types, so field order matches the native binary's output exactly.
    let out = match r.op.as_str() {
        "version" => Ok(serde_json::to_vec(
            &serde_json::json!({ "engineVersion": crate::ENGINE_VERSION, "contractVersion": crate::CONTRACT_VERSION }),
        )),
        "list" => job::list_archive(&src, &limits)
            .map(|v| serde_json::to_vec(&v))
            .map_err(|e| e.code),
        "inspect" => {
            let res = if r.emit {
                job::inspect_archive_part(&src, &limits, &mut HostSink, r.part)
            } else {
                job::inspect_archive_part(&src, &limits, &mut Discard, r.part)
            };
            res.map(|v| serde_json::to_vec(&v)).map_err(|e| e.code)
        }
        "file" => job::inspect_file(&r.path, &src)
            .map(|v| serde_json::to_vec(&v))
            .map_err(|_| "io"),
        "hash" => crate::hash::digest_source(&src)
            .map(|d| serde_json::to_vec(&serde_json::json!({ "sha256": d.sha256, "crc32": d.crc32, "size": d.len })))
            .map_err(|_| "io"),
        _ => Err("unknown_op"),
    };
    match out {
        Ok(Ok(bytes)) => bytes,
        Ok(Err(_)) => err("serialize"),
        Err(code) => err(code),
    }
}

/// Runs one request (JSON at `ptr`/`len`); returns the length of the JSON answer, read with `engine_result_ptr`.
///
/// # Safety
/// `ptr`/`len` must describe readable memory owned by the caller.
#[no_mangle]
pub unsafe extern "C" fn engine_call(ptr: *const u8, len: u32) -> u32 {
    let req = std::slice::from_raw_parts(ptr, len as usize);
    let answer = run(req);
    RESULT.with(|r| {
        *r.borrow_mut() = answer;
        r.borrow().len() as u32
    })
}

#[no_mangle]
pub extern "C" fn engine_result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}
