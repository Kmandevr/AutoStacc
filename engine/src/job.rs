// Job entry points: what the server Container and the Pack Builder ask the engine to do, answered in the JSON job
// contract (contract version in lib.rs). `inspect_archive` checks a ZIP and reads every file in it once (hashes, format,
// facts) while handing each file's original bytes to a sink; `inspect_file` does the same for one loose file.
use crate::facts::{self, Facts, HEAD_BYTES, MIDI_MAX};
use crate::formats::{self, Identity};
use crate::hash::Hasher;
use crate::zipread::{self, Entry, EntryReader, Issue, Limits, ZipError};
use crate::{Source, CONTRACT_VERSION, ENGINE_VERSION};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResult {
    pub path: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crc32: Option<u32>,
    #[serde(flatten)]
    pub identity: Identity,
    pub facts: Facts,
    /// Problems found in the archive listing or while extracting; `refused` ones are not imported.
    pub issues: Vec<Issue>,
    pub ignored: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectResult {
    pub contract_version: u32,
    pub engine_version: &'static str,
    pub zip64: bool,
    pub total_size: u64,
    pub folders: Vec<String>,
    pub files: Vec<FileResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobError {
    pub code: &'static str,
}

impl From<ZipError> for JobError {
    fn from(e: ZipError) -> Self {
        JobError { code: e.code() }
    }
}

/// Receives each imported file's original bytes, in order, chunk by chunk (to store or upload them).
pub trait Sink {
    fn begin(&mut self, _path: &str, _size: u64) {}
    fn chunk(&mut self, _bytes: &[u8]) {}
    fn end(&mut self, _ok: bool) {}
}

/// A sink that keeps nothing (inspection only).
pub struct Discard;
impl Sink for Discard {}

const CHUNK: usize = 256 << 10;

fn head_limit(format_hint: &str, size: u64) -> usize {
    if format_hint == "midi" && size <= MIDI_MAX as u64 {
        size as usize
    } else {
        HEAD_BYTES.min(size as usize)
    }
}

fn listing_only(e: &Entry) -> FileResult {
    FileResult {
        path: e.path.clone(),
        size: e.size,
        sha256: None,
        crc32: None,
        identity: formats::identify(&e.path, &[]),
        facts: Facts::default(),
        issues: e.issues.clone(),
        ignored: e.ignored,
    }
}

/// Lists an archive without extracting anything: the instant tree and problem list.
pub fn list_archive(src: &dyn Source, limits: &Limits) -> Result<InspectResult, JobError> {
    let a = zipread::list(src, limits)?;
    let folders = folders_of(&a.entries);
    let files = a.entries.iter().filter(|e| !e.is_dir).map(listing_only).collect();
    Ok(InspectResult {
        contract_version: CONTRACT_VERSION,
        engine_version: ENGINE_VERSION,
        zip64: a.zip64,
        total_size: a.total_size,
        folders,
        files,
    })
}

fn folders_of(entries: &[Entry]) -> Vec<String> {
    let mut set = std::collections::BTreeSet::new();
    for e in entries.iter().filter(|e| !e.refused() && !e.ignored) {
        let p = e.path.as_str();
        let mut end = if e.is_dir { p.len() } else { p.rfind('/').unwrap_or(0) };
        while end > 0 {
            set.insert(p[..end].to_string());
            end = p[..end].rfind('/').unwrap_or(0);
        }
    }
    set.into_iter().collect()
}

/// Checks a ZIP and reads every importable file once: SHA-256 + CRC-32, real format, header facts.
pub fn inspect_archive(src: &dyn Source, limits: &Limits, sink: &mut dyn Sink) -> Result<InspectResult, JobError> {
    inspect_archive_part(src, limits, sink, None)
}

/// Same, for one share of the files: `part = (i, n)` takes every n-th file starting at the i-th, so n Web Workers can
/// split one archive between them (each lists it, which costs milliseconds, and reads only its own files).
pub fn inspect_archive_part(
    src: &dyn Source,
    limits: &Limits,
    sink: &mut dyn Sink,
    part: Option<(usize, usize)>,
) -> Result<InspectResult, JobError> {
    let a = zipread::list(src, limits)?;
    let folders = folders_of(&a.entries);
    let mut files = Vec::new();
    let mut buf = vec![0u8; CHUNK];
    let mine = |k: usize| part.is_none_or(|(i, n)| n > 0 && k % n == i);
    for (_, e) in a
        .entries
        .iter()
        .filter(|e| !e.is_dir)
        .enumerate()
        .filter(|(k, _)| mine(*k))
    {
        let mut r = listing_only(e);
        if !e.importable() {
            files.push(r);
            continue;
        }
        let hint = formats::identify(&e.path, &[]).format;
        let want = head_limit(&hint, e.size);
        let mut head = Vec::with_capacity(want);
        sink.begin(&e.path, e.size);
        let mut reader = EntryReader::open(src, e)?;
        let outcome = loop {
            match reader.read(&mut buf) {
                Ok(0) => break Ok(()),
                Ok(n) => {
                    if head.len() < want {
                        let take = (want - head.len()).min(n);
                        head.extend_from_slice(&buf[..take]);
                    }
                    sink.chunk(&buf[..n]);
                }
                Err(err) => break Err(err),
            }
        };
        match outcome {
            Ok(()) => {
                let d = reader.digests().cloned().expect("digests after a clean end");
                r.identity = formats::identify(&e.path, &head);
                r.facts = facts::extract(&r.identity.format, &head, e.size);
                if r.identity.mismatch {
                    r.issues.push(Issue {
                        code: "content_does_not_match_name",
                        refused: true,
                    });
                }
                r.sha256 = Some(d.sha256);
                r.crc32 = Some(d.crc32);
                sink.end(!r.identity.mismatch);
            }
            Err(err) => {
                r.issues.push(Issue {
                    code: err.code(),
                    refused: true,
                });
                sink.end(false);
            }
        }
        files.push(r);
    }
    Ok(InspectResult {
        contract_version: CONTRACT_VERSION,
        engine_version: ENGINE_VERSION,
        zip64: a.zip64,
        total_size: a.total_size,
        folders,
        files,
    })
}

/// One loose file (uploaded on its own, or re-checked from storage).
pub fn inspect_file(path: &str, src: &dyn Source) -> std::io::Result<FileResult> {
    let size = src.len();
    let hint = formats::identify(path, &[]).format;
    let want = head_limit(&hint, size);
    let mut head = vec![0u8; want];
    src.read_exact_at(0, &mut head)?;
    let mut h = Hasher::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut off = 0u64;
    while off < size {
        let n = src.read_at(off, &mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        off += n as u64;
    }
    let d = h.finish();
    let identity = formats::identify(path, &head);
    let facts = facts::extract(&identity.format, &head, size);
    let mut issues = Vec::new();
    if identity.mismatch {
        issues.push(Issue {
            code: "content_does_not_match_name",
            refused: true,
        });
    }
    Ok(FileResult {
        path: path.to_string(),
        size,
        sha256: Some(d.sha256),
        crc32: Some(d.crc32),
        identity,
        facts,
        issues,
        ignored: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::facts::tests::wav_bytes;
    use crate::zipread::tests::{build_zip, TestEntry};

    struct Collect(Vec<(String, Vec<u8>, bool)>);
    impl Sink for Collect {
        fn begin(&mut self, path: &str, _size: u64) {
            self.0.push((path.into(), Vec::new(), false));
        }
        fn chunk(&mut self, b: &[u8]) {
            self.0.last_mut().unwrap().1.extend_from_slice(b);
        }
        fn end(&mut self, ok: bool) {
            self.0.last_mut().unwrap().2 = ok;
        }
    }

    #[test]
    fn inspects_a_pack_and_hands_over_exact_originals() {
        let kick = wav_bytes(44_100, 1, 16, 22_050, Some((0.0, true)));
        let fake = b"definitely not audio".to_vec();
        let zip = build_zip(&[
            TestEntry::file("Pack/Drums/Kicks/Kick 01.wav", &kick),
            TestEntry::file("Pack/Drums/Kicks/Fake.wav", &fake),
            TestEntry::file("Pack/../escape.wav", &kick),
            TestEntry::file("__MACOSX/Pack/._Kick 01.wav", b"x"),
        ]);
        let mut sink = Collect(Vec::new());
        let r = inspect_archive(&zip, &Limits::default(), &mut sink).unwrap();
        assert_eq!(r.folders, vec!["Pack", "Pack/Drums", "Pack/Drums/Kicks"]);
        let kick_r = &r.files[0];
        assert_eq!(kick_r.identity.format, "wav");
        assert_eq!(kick_r.facts.duration_ms, Some(500));
        assert_eq!(kick_r.facts.embedded.one_shot, Some(true));
        assert_eq!(
            kick_r.sha256.as_deref(),
            Some(crate::hash::digest_source(&kick).unwrap().sha256.as_str())
        );
        assert_eq!(sink.0[0], ("Pack/Drums/Kicks/Kick 01.wav".into(), kick.clone(), true));
        assert!(r.files[1]
            .issues
            .iter()
            .any(|i| i.code == "content_does_not_match_name"));
        assert!(!sink.0[1].2, "a deceptive file is not accepted by the sink");
        assert!(r.files[2].issues.iter().any(|i| i.code == "path_traversal"));
        assert!(r.files[3].ignored);
        assert_eq!(sink.0.len(), 2, "refused and ignored entries are never extracted");
    }

    #[test]
    fn shares_cover_every_file_once() {
        let names: Vec<String> = (0..7).map(|i| format!("Pack/f{i}.txt")).collect();
        let entries: Vec<TestEntry> = names.iter().map(|n| TestEntry::file(n, b"x")).collect();
        let zip = build_zip(&entries);
        let mut seen: Vec<String> = (0..3)
            .flat_map(|i| {
                inspect_archive_part(&zip, &Limits::default(), &mut Discard, Some((i, 3)))
                    .unwrap()
                    .files
            })
            .map(|f| f.path)
            .collect();
        seen.sort();
        assert_eq!(seen, names);
    }

    #[test]
    fn loose_file() {
        let w = wav_bytes(96_000, 2, 32, 9_600, None);
        let f = inspect_file("Bass.wav", &w).unwrap();
        assert_eq!(
            (f.facts.sample_rate, f.facts.bit_depth, f.facts.duration_ms),
            (Some(96_000), Some(32), Some(100))
        );
    }
}
