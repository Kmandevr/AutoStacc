// Any bytes as a file of every known format: identification and header facts must return, never panic.
#![no_main]
use autostacc_engine::{facts, formats};
use libfuzzer_sys::fuzz_target;

const NAMES: [&str; 8] = ["a.wav", "a.aif", "a.flac", "a.mid", "a.mp3", "a.ogg", "a.vital", "a.bin"];

fuzz_target!(|data: &[u8]| {
    let Some((&pick, bytes)) = data.split_first() else { return };
    let name = NAMES[pick as usize % NAMES.len()];
    let id = formats::identify(name, bytes);
    let _ = facts::extract(&id.format, bytes, bytes.len() as u64);
    for f in ["wav", "aiff", "flac", "midi"] {
        let _ = facts::extract(f, bytes, bytes.len() as u64 + pick as u64);
    }
});
