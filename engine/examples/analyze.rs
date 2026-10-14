// Developer tool: analyses audio files and prints what the engine hears (tempo, key, and the measures behind them).
//   cargo run --release --example analyze -- <file.wav>...
fn main() {
    for p in std::env::args().skip(1) {
        let bytes = std::fs::read(&p).expect("read");
        let ext = p.rsplit('.').next().unwrap_or("").to_lowercase();
        let a = autostacc_engine::analysis::analyze(&ext, bytes, true);
        println!(
            "{p}: {}",
            serde_json::to_string(&a.map(|a| (a.bpm, a.key, a.analyzed_ms))).unwrap()
        );
        if let Some((mono, rate, _)) = autostacc_engine::analysis::decode(&ext, std::fs::read(&p).unwrap()) {
            println!("  measures: {:?}", autostacc_engine::analysis::measures(&mono, rate));
        }
    }
}
