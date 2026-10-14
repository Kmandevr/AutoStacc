// Command-line front of the engine, as the server Container runs it (and as developers and benchmarks use it):
//   autostacc-engine list <archive.zip>              → archive listing and problems (JSON)
//   autostacc-engine inspect <archive.zip> [--extract <dir>]  → full inspection; optionally writes the originals
//   autostacc-engine file <path>                     → one loose file
//   autostacc-engine serve [addr]                    → the Container's HTTP service (serve.rs), default 0.0.0.0:8080
// With --vocabulary <file.json> (list, inspect, file), each accepted file also gets suggestions (classify.rs); with
// --analyze (inspect), each audio file's start is also analysed for a tempo, key and waveform (analysis.rs).
// Output is the JSON job contract on stdout; failures are {"error": code} with exit status 2.
use autostacc_engine::classify::{self, Vocabulary};
use autostacc_engine::job::{self, Discard, Sink};
use autostacc_engine::source::FileSource;
use autostacc_engine::zipread::Limits;
use std::io::Write;
use std::path::{Path, PathBuf};

fn fail(code: &str) -> ! {
    println!("{}", serde_json::json!({ "error": code }));
    std::process::exit(2)
}

/// Writes each accepted original under `dir`, at a numbered name (archive paths never become file-system paths).
struct ExtractTo {
    dir: PathBuf,
    n: usize,
    file: Option<std::io::BufWriter<std::fs::File>>,
}

impl Sink for ExtractTo {
    fn begin(&mut self, _path: &str, _size: u64) {
        self.n += 1;
        let f = std::fs::File::create(self.dir.join(format!("{:06}.bin", self.n))).unwrap_or_else(|_| fail("io"));
        self.file = Some(std::io::BufWriter::with_capacity(1 << 20, f));
    }
    fn chunk(&mut self, b: &[u8]) {
        self.file.as_mut().unwrap().write_all(b).unwrap_or_else(|_| fail("io"));
    }
    fn end(&mut self, ok: bool) {
        let mut f = self.file.take().unwrap();
        f.flush().unwrap_or_else(|_| fail("io"));
        if !ok {
            let _ = std::fs::remove_file(self.dir.join(format!("{:06}.bin", self.n)));
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let open = |p: &str| FileSource::open(Path::new(p)).unwrap_or_else(|_| fail("io"));
    let vocab: Option<Vocabulary> = args.iter().position(|a| a == "--vocabulary").map(|i| {
        let text =
            std::fs::read(args.get(i + 1).unwrap_or_else(|| fail("bad_vocabulary"))).unwrap_or_else(|_| fail("io"));
        serde_json::from_slice(&text).unwrap_or_else(|_| fail("bad_vocabulary"))
    });
    let with = |mut r: job::InspectResult| {
        if let Some(v) = &vocab {
            classify::apply(&mut r, v);
        }
        r
    };
    // --analyze (inspect): also listen to each audio file's start for a tempo, key and waveform (analysis.rs).
    let analyze = args.iter().any(|a| a == "--analyze");
    let run = |src: &FileSource, sink: &mut dyn job::Sink| {
        if analyze {
            job::inspect_archive_analyzed(src, &Limits::default(), sink)
        } else {
            job::inspect_archive(src, &Limits::default(), sink)
        }
    };
    let out = match (args.first().map(String::as_str), args.get(1)) {
        (Some("list"), Some(p)) => serde_json::to_string(&with(
            job::list_archive(&open(p), &Limits::default()).unwrap_or_else(|e| fail(e.code)),
        )),
        (Some("inspect"), Some(p)) => {
            let src = open(p);
            let r = match args.iter().position(|a| a == "--extract").and_then(|i| args.get(i + 1)) {
                Some(dir) => {
                    std::fs::create_dir_all(dir).unwrap_or_else(|_| fail("io"));
                    run(
                        &src,
                        &mut ExtractTo {
                            dir: dir.into(),
                            n: 0,
                            file: None,
                        },
                    )
                }
                None => run(&src, &mut Discard),
            };
            serde_json::to_string(&with(r.unwrap_or_else(|e| fail(e.code))))
        }
        (Some("serve"), addr) => autostacc_engine::serve::serve(addr.map(String::as_str).unwrap_or("0.0.0.0:8080")),
        (Some("file"), Some(p)) => {
            let mut r = job::inspect_file(p, &open(p)).unwrap_or_else(|_| fail("io"));
            if let Some(v) = &vocab {
                r.suggestions = classify::suggest(&r, v);
            }
            serde_json::to_string(&r)
        }
        _ => {
            eprintln!("usage: autostacc-engine list|inspect|file <path> [--extract <dir>] [--vocabulary <file>] [--analyze] | serve [addr]");
            std::process::exit(64)
        }
    };
    println!("{}", out.unwrap());
}
