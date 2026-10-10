// Any bytes as an archive: listing and full inspection (with suggestions) must return, never panic, and only hand
// the sink as many bytes as each entry declares.
#![no_main]
use autostacc_engine::classify::{self, Vocabulary};
use autostacc_engine::job::{self, Sink};
use autostacc_engine::zipread::Limits;
use libfuzzer_sys::fuzz_target;
use std::sync::OnceLock;

fn vocab() -> &'static Vocabulary {
    static V: OnceLock<Vocabulary> = OnceLock::new();
    V.get_or_init(|| serde_json::from_str(include_str!("../../conformance/vocabulary.json")).unwrap())
}

struct Count {
    declared: u64,
    got: u64,
}
impl Sink for Count {
    fn begin(&mut self, _path: &str, size: u64) {
        self.declared = size;
        self.got = 0;
    }
    fn chunk(&mut self, b: &[u8]) {
        self.got += b.len() as u64;
        assert!(self.got <= self.declared, "more bytes than the entry declares");
    }
}

fuzz_target!(|data: &[u8]| {
    let limits = Limits {
        max_entries: 256,
        max_total_bytes: 8 << 20,
        max_entry_bytes: 4 << 20,
        ..Limits::default()
    };
    let src = data.to_vec();
    if let Ok(mut r) = job::list_archive(&src, &limits) {
        classify::apply(&mut r, vocab());
    }
    let mut sink = Count { declared: 0, got: 0 };
    if let Ok(mut r) = job::inspect_archive(&src, &limits, &mut sink) {
        classify::apply(&mut r, vocab());
    }
});
