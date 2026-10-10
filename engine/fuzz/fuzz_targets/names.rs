// Any text as a path: reading words, tempos and keys from it, and suggesting values, must return, never panic.
#![no_main]
use autostacc_engine::classify::{self, Vocabulary};
use autostacc_engine::job;
use autostacc_engine::naming;
use libfuzzer_sys::fuzz_target;
use std::sync::OnceLock;

fn vocab() -> &'static Vocabulary {
    static V: OnceLock<Vocabulary> = OnceLock::new();
    V.get_or_init(|| serde_json::from_str(include_str!("../../conformance/vocabulary.json")).unwrap())
}

fuzz_target!(|data: &[u8]| {
    let Ok(path) = std::str::from_utf8(data) else { return };
    let words = naming::tokens(path);
    let _ = naming::tempos(&words);
    let _ = naming::keys(&words);
    let _ = naming::matches(&words, &vocab().words.instrument);
    let wav = b"RIFF\x24\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x44\xac\0\0\x88\x58\x01\0\x02\0\x10\0data\0\0\0\0";
    if let Ok(f) = job::inspect_file(path, &wav.to_vec()) {
        let _ = classify::suggest(&f, vocab());
    }
});
