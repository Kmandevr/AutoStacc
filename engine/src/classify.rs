// Suggestions from evidence: what kind of asset a file is, its instrument, tempo, key and (for MIDI) its role, each with
// where it came from (the contract's origins: filename, folder-name, embedded, rule), a confidence and the reasons. A
// pure step over the engine's own answer plus the vocabulary sent with the job, so it can be switched off or replaced on
// its own. Suggestions only: nothing here is ever shown as verified, and a creator's own value always wins.
// The confidences are starting values, to be calibrated on labelled packs (docs/packs.md, Phase 8).
use crate::job::{FileResult, InspectResult};
use crate::naming;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Vocabulary {
    pub kinds: BTreeMap<String, KindDef>,
    pub words: Words,
    pub keys: Vec<String>,
    pub bpm: BpmRange,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KindDef {
    pub formats: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Words {
    pub kind: BTreeMap<String, String>,
    pub instrument: BTreeMap<String, String>,
    #[serde(rename = "midiRole")]
    pub midi_role: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BpmRange {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Suggestion {
    pub field: &'static str,
    pub value: String,
    pub origin: &'static str,
    pub confidence: f64,
    pub reasons: Vec<String>,
}

struct Evidence {
    value: String,
    origin: &'static str,
    weight: f64,
    reason: String,
    /// Where in the path a name said it: 0 the file's own name, 1 its folder, 2 the folder above, …
    level: usize,
}

fn ev(value: impl Into<String>, origin: &'static str, weight: f64, reason: String) -> Evidence {
    Evidence {
        value: value.into(),
        origin,
        weight,
        reason,
        level: usize::MAX,
    }
}

fn at(level: usize, e: Evidence) -> Evidence {
    Evidence { level, ..e }
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// Several pieces of evidence for one field → one suggestion: agreeing evidence adds up (1 − Π(1 − w)), a rival value
/// takes away half its own strength. The origin is that of the strongest evidence for the winner.
/// The most an analysis alone may weigh: below the store's auto-accept (js/pack-resolve.js AUTO_ACCEPT, 0.85), so a
/// tempo or key only heard is offered to the creator, never applied by itself (docs/engine.md, "Analysis": calibration).
pub const ANALYSIS_MAX: f64 = 0.8;

/// What an analysis estimate adds: `(value, weight)` to push as evidence, or None to leave it out. It weighs at most
/// ANALYSIS_MAX. When the name, folder or header already gives a value, what was heard can support it or question it,
/// never replace it (what the creator wrote is a claim; what was heard is a guess): `agrees(heard, named)` is 1 when
/// it supports a named value, -1 for the usual near miss (half or double time, the relative key), which then says
/// nothing, and 0 otherwise; a value that agrees with no named one is a rival at half weight.
fn heard_evidence(
    evidence: &[Evidence],
    value: &str,
    confidence: f64,
    agrees: impl Fn(&str, &str) -> f64,
) -> Option<(String, f64)> {
    let w = confidence.min(ANALYSIS_MAX);
    let named: Vec<&Evidence> = evidence.iter().filter(|e| e.origin != "analysis").collect();
    if named.is_empty() {
        return Some((value.to_string(), w));
    }
    let best = named
        .iter()
        .map(|e| (agrees(value, &e.value), &e.value))
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))?;
    match best.0 {
        x if x > 0.0 => Some((best.1.clone(), w * x)),
        x if x < 0.0 => None,
        _ => Some((value.to_string(), w / 2.0)),
    }
}

/// How a heard tempo bears on a named one: the same within 1% supports it; half or double time (the usual mistake,
/// which analysis names itself) neither supports nor questions it.
fn tempo_agrees(heard: &str, named: &str) -> f64 {
    let (Ok(h), Ok(n)) = (heard.parse::<f64>(), named.parse::<f64>()) else {
        return 0.0;
    };
    let close = |a: f64, b: f64| (a / b - 1.0).abs() <= 0.01;
    if close(h, n) {
        1.0
    } else if close(h * 2.0, n) || close(h / 2.0, n) {
        -1.0
    } else {
        0.0
    }
}

/// How a heard key bears on a named one: the same supports it; its relative key (same notes, the usual mistake)
/// neither supports nor questions it.
fn key_agrees(heard: &str, named: &str) -> f64 {
    if heard == named {
        return 1.0;
    }
    const NAMES: [&str; 12] = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
    let parse = |k: &str| {
        let (t, q) = k.split_once('-')?;
        Some((NAMES.iter().position(|n| *n == t)?, q == "minor"))
    };
    match (parse(heard), parse(named)) {
        (Some((h, hm)), Some((n, nm))) if hm != nm && (if hm { (h + 3) % 12 == n } else { (h + 9) % 12 == n }) => -1.0,
        _ => 0.0,
    }
}

fn decide(field: &'static str, evidence: Vec<Evidence>) -> Option<Suggestion> {
    let mut by_value: Vec<(String, f64, Vec<&Evidence>)> = Vec::new();
    for e in &evidence {
        match by_value.iter_mut().find(|(v, _, _)| *v == e.value) {
            Some((_, miss, list)) => {
                *miss *= 1.0 - e.weight;
                list.push(e);
            }
            None => by_value.push((e.value.clone(), 1.0 - e.weight, vec![e])),
        }
    }
    // Highest combined confidence first; ties keep the order the evidence came in.
    let mut ranked: Vec<(String, f64, Vec<&Evidence>)> = by_value
        .into_iter()
        .map(|(v, miss, list)| (v, 1.0 - miss, list))
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let (value, combined, list) = ranked.first()?;
    let mut reasons: Vec<String> = list.iter().map(|e| e.reason.clone()).collect();
    let mut confidence = *combined;
    if let Some((rival, strength, _)) = ranked.get(1) {
        confidence *= 1.0 - strength / 2.0;
        reasons.push(format!("but {rival}"));
    }
    // Where the value comes from: its heaviest named evidence; "analysis" only when nothing but listening says it.
    let named: Vec<&&Evidence> = list.iter().filter(|e| e.origin != "analysis").collect();
    let pool: Vec<&&Evidence> = if named.is_empty() { list.iter().collect() } else { named };
    let origin = pool
        .into_iter()
        .max_by(|a, b| a.weight.partial_cmp(&b.weight).unwrap_or(std::cmp::Ordering::Equal))
        .map(|e| e.origin)?;
    Some(Suggestion {
        field,
        value: value.clone(),
        origin,
        confidence: round2(confidence.min(0.99)),
        reasons,
    })
}

/// The words of a file's name (without its extension) and of its folders, nearest folder first.
struct Names {
    file: Vec<String>,
    folders: Vec<(String, Vec<String>)>,
}

fn names(path: &str) -> Names {
    let mut parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let file = parts.pop().unwrap_or("");
    let stem = match file.rfind('.') {
        Some(i) if i > 0 => &file[..i],
        _ => file,
    };
    Names {
        file: naming::tokens(stem),
        folders: parts.iter().rev().map(|p| (p.to_string(), naming::tokens(p))).collect(),
    }
}

/// How much a folder's name counts: the nearest folder most, each level up a little less.
fn folder_weight(top: f64, depth: usize) -> f64 {
    (top - 0.05 * depth as f64).max(top - 0.2)
}

fn words_evidence(
    n: &Names,
    table: &BTreeMap<String, String>,
    allowed: &dyn Fn(&str) -> bool,
    file_w: f64,
    folder_w: f64,
) -> Vec<Evidence> {
    let mut out = Vec::new();
    for (v, said) in naming::matches(&n.file, table) {
        if allowed(&v) {
            out.push(at(0, ev(v, "filename", file_w, format!("name: {said}"))));
        }
    }
    for (d, (_, words)) in n.folders.iter().enumerate() {
        for (v, said) in naming::matches(words, table) {
            if allowed(&v) {
                out.push(at(
                    d + 1,
                    ev(v, "folder-name", folder_weight(folder_w, d), format!("folder: {said}")),
                ));
            }
        }
    }
    out
}

fn bpm_text(b: f64) -> String {
    if b.fract() == 0.0 {
        format!("{}", b as u64)
    } else {
        format!("{}", round2(b))
    }
}

fn bars_text(bars: u64) -> String {
    format!("{bars} whole bar{}", if bars == 1 { "" } else { "s" })
}

/// Whole 4/4 bars at this tempo, if the length fits them (within 2% of a bar).
fn whole_bars(duration_ms: u64, bpm: f64) -> Option<u64> {
    let bars = duration_ms as f64 / 60_000.0 * bpm / 4.0;
    (bars >= 0.98 && (bars - bars.round()).abs() <= 0.02).then(|| bars.round() as u64)
}

/// The suggestions for one file.
pub fn suggest(f: &FileResult, vocab: &Vocabulary) -> Vec<Suggestion> {
    let n = names(&f.path);
    let fmt = f.identity.format.as_str();
    let audio_formats = vocab
        .kinds
        .get("one-shots")
        .map(|k| k.formats.as_slice())
        .unwrap_or(&[]);
    let audio = audio_formats.iter().any(|x| x == fmt);
    let midi = fmt == "midi";
    let format_kind = vocab
        .kinds
        .iter()
        .find(|(_, k)| k.formats.iter().any(|x| x == fmt))
        .map(|(k, _)| k.clone());
    let e = &f.facts.embedded;
    let mut out = Vec::new();

    // Tempo candidates first: the kind's whole-bars rule uses them.
    let in_range = |b: f64| b >= vocab.bpm.min && b <= vocab.bpm.max;
    let kind_words = words_evidence(
        &n,
        &vocab.words.kind,
        &|k| {
            !audio
                || vocab
                    .kinds
                    .get(k)
                    .is_some_and(|d| d.formats.is_empty() || d.formats.iter().any(|x| x == fmt))
        },
        0.85,
        0.8,
    );
    let says_loop =
        kind_words.iter().any(|k| k.value == "loops") || e.loop_points == Some(true) || e.one_shot == Some(false);
    let mut bpm_ev = Vec::new();
    if audio || midi {
        if let Some(b) = e.bpm.filter(|b| in_range(*b)) {
            bpm_ev.push(ev(
                bpm_text(b),
                "embedded",
                0.85,
                format!("written in the file: {} bpm", bpm_text(b)),
            ));
        }
        for t in naming::tempos(&n.file).into_iter().filter(|t| in_range(t.bpm)) {
            if t.marked {
                bpm_ev.push(ev(bpm_text(t.bpm), "filename", 0.9, format!("name: {}", t.said)));
            } else if (says_loop || midi) && (60.0..=200.0).contains(&t.bpm) {
                bpm_ev.push(ev(bpm_text(t.bpm), "filename", 0.55, format!("name: {}", t.said)));
            }
        }
        for (d, (_, words)) in n.folders.iter().enumerate() {
            for t in naming::tempos(words)
                .into_iter()
                .filter(|t| t.marked && in_range(t.bpm))
            {
                bpm_ev.push(ev(
                    bpm_text(t.bpm),
                    "folder-name",
                    folder_weight(0.8, d),
                    format!("folder: {}", t.said),
                ));
            }
        }
    }
    // What listening to the file found (analysis.rs, when the job asked for it).
    let heard = f.analysis.as_ref();
    if let Some(a) = heard.and_then(|a| a.bpm.as_ref()) {
        if let Ok(b) = a.value.parse::<f64>() {
            if in_range(b) && (audio || midi) {
                if let Some((v, w)) = heard_evidence(&bpm_ev, &bpm_text(b), a.confidence, tempo_agrees) {
                    bpm_ev.push(ev(v, "analysis", w, format!("heard: {}", a.reasons.join("; "))));
                }
            }
        }
    }
    let mut tempo = decide("bpm", bpm_ev);

    // Kind.
    if audio {
        let mut ev_kind = kind_words;
        match e.one_shot {
            Some(true) => ev_kind.push(ev("one-shots", "embedded", 0.7, "written in the file: one-shot".into())),
            Some(false) => ev_kind.push(ev("loops", "embedded", 0.6, "written in the file: loop".into())),
            None => {}
        }
        if e.loop_points == Some(true) {
            ev_kind.push(ev("loops", "embedded", 0.6, "loop points in the file".into()));
        }
        // Not from a tempo only analysis found: analysis already fits its tempo to the length, so it proves nothing.
        if let (Some(ms), Some(t)) = (f.facts.duration_ms, tempo.as_ref().filter(|t| t.origin != "analysis")) {
            if let Some(bars) = t.value.parse().ok().and_then(|b| whole_bars(ms, b)) {
                ev_kind.push(ev(
                    "loops",
                    "rule",
                    0.6,
                    format!("{} at {} bpm", bars_text(bars), t.value),
                ));
            }
        }
        if let Some(ms) = f.facts.duration_ms {
            if ms < 1500 && !ev_kind.iter().any(|x| x.value == "loops") {
                ev_kind.push(ev(
                    "one-shots",
                    "rule",
                    0.5,
                    format!("short: {:.1} s", ms as f64 / 1000.0),
                ));
            }
        }
        out.extend(decide("kind", ev_kind));
    } else if let Some(k) = format_kind {
        out.extend(decide("kind", vec![ev(k, "rule", 0.95, format!("format: {fmt}"))]));
    }

    // Instrument: the deepest name that names one decides; the same value higher up adds a little.
    if audio || midi || out.first().is_some_and(|s| s.value == "presets") {
        let all = words_evidence(&n, &vocab.words.instrument, &|_| true, 0.8, 0.7);
        if let Some(lead) = all.iter().map(|x| x.level).min() {
            let named: Vec<String> = all
                .iter()
                .filter(|x| x.level == lead)
                .map(|x| x.value.clone())
                .collect();
            let kept: Vec<Evidence> = all.into_iter().filter(|x| named.contains(&x.value)).collect();
            out.extend(decide("instrument", kept));
        }
    }

    // Tempo, checked against the length for audio: a loop's length is whole bars. Not for a tempo only analysis found:
    // it already fitted the length, so the check would count the same evidence twice.
    if let (Some(t), true) = (tempo.as_mut().filter(|t| t.origin != "analysis"), audio) {
        let looped = out.iter().any(|s| s.field == "kind" && s.value == "loops");
        if let (Some(ms), Ok(b)) = (f.facts.duration_ms, t.value.parse::<f64>()) {
            match whole_bars(ms, b) {
                Some(bars) => {
                    t.confidence = round2(t.confidence.max(0.9));
                    t.reasons.push(format!("length is {}", bars_text(bars)));
                }
                None if looped => {
                    t.confidence = round2(t.confidence * 0.7);
                    t.reasons.push("length isn't whole bars".into());
                }
                None => {}
            }
        }
    }
    out.extend(tempo);

    // Key: written in the name or the file (MIDI key signature).
    if audio || midi {
        let mut ev_key = Vec::new();
        for (v, said) in naming::keys(&n.file) {
            ev_key.push(ev(v, "filename", 0.75, format!("name: {said}")));
        }
        for (d, (_, words)) in n.folders.iter().enumerate() {
            for (v, said) in naming::keys(words) {
                ev_key.push(ev(v, "folder-name", folder_weight(0.6, d), format!("folder: {said}")));
            }
        }
        if let Some(k) = &e.key {
            ev_key.push(ev(k.clone(), "embedded", 0.8, format!("written in the file: {k}")));
        }
        if let Some(a) = heard.and_then(|a| a.key.as_ref()) {
            if let Some((v, w)) = heard_evidence(&ev_key, &a.value, a.confidence, key_agrees) {
                ev_key.push(ev(v, "analysis", w, format!("heard: {}", a.reasons.join("; "))));
            }
        }
        ev_key.retain(|x| vocab.keys.contains(&x.value));
        out.extend(decide("key", ev_key));
    }

    // A MIDI file's role: named, or from its length and tracks.
    if midi {
        let mut ev_role = words_evidence(&n, &vocab.words.midi_role, &|_| true, 0.8, 0.7);
        if let Some(beats) = f.facts.length_beats {
            if beats <= 64.0 {
                ev_role.push(ev("pattern", "rule", 0.6, format!("{} beats long", beats.round())));
            } else {
                ev_role.push(ev("arrangement", "rule", 0.55, format!("{} beats long", beats.round())));
            }
        }
        if f.facts.midi_tracks.is_some_and(|t| t >= 4) {
            ev_role.push(ev(
                "arrangement",
                "rule",
                0.5,
                format!("{} tracks", f.facts.midi_tracks.unwrap()),
            ));
        }
        out.extend(decide("midiRole", ev_role));
    }
    out
}

/// Adds suggestions to every file the engine accepted (not refused, not ignored).
pub fn apply(result: &mut InspectResult, vocab: &Vocabulary) {
    for f in result.files.iter_mut() {
        if f.ignored || f.issues.iter().any(|i| i.refused) {
            continue;
        }
        f.suggestions = suggest(f, vocab);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::facts::Facts;
    use crate::formats::Identity;

    fn vocab() -> Vocabulary {
        let w = |pairs: &[(&str, &str)]| pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
        let k = |f: &[&str]| KindDef {
            formats: f.iter().map(|s| s.to_string()).collect(),
        };
        Vocabulary {
            kinds: [
                ("one-shots".to_string(), k(&["wav", "aiff"])),
                ("loops".into(), k(&[])),
                ("midi".into(), k(&["midi"])),
                ("presets".into(), k(&["vital"])),
            ]
            .into_iter()
            .collect(),
            words: Words {
                kind: w(&[
                    ("loops", "loops"),
                    ("loop", "loops"),
                    ("one-shots", "one-shots"),
                    ("midi", "midi"),
                ]),
                instrument: w(&[
                    ("drums", "drums"),
                    ("kick", "kick"),
                    ("kicks", "kick"),
                    ("bass", "bass"),
                ]),
                midi_role: w(&[("pattern", "pattern")]),
            },
            keys: vec![
                "a-minor".into(),
                "cs-minor".into(),
                "fs-minor".into(),
                "gs-major".into(),
                "a-major".into(),
            ],
            bpm: BpmRange { min: 40.0, max: 250.0 },
        }
    }

    fn file(path: &str, format: &str, facts: Facts) -> FileResult {
        FileResult {
            path: path.into(),
            size: 1,
            sha256: None,
            crc32: None,
            identity: Identity {
                format: format.into(),
                by: "signature",
                mismatch: false,
            },
            facts,
            issues: vec![],
            ignored: false,
            suggestions: vec![],
            stored: None,
            analysis: None,
        }
    }

    fn get<'a>(s: &'a [Suggestion], field: &str) -> &'a Suggestion {
        s.iter()
            .find(|x| x.field == field)
            .unwrap_or_else(|| panic!("no {field} in {s:?}"))
    }

    #[test]
    fn a_loop_named_with_tempo_and_key() {
        let facts = Facts {
            duration_ms: Some(7500), // 4 bars at 128 bpm
            ..Default::default()
        };
        let s = suggest(&file("Pack/Loops/Bass Loop 128 BPM Am.wav", "wav", facts), &vocab());
        let kind = get(&s, "kind");
        assert_eq!((kind.value.as_str(), kind.origin), ("loops", "filename"));
        assert!(kind.confidence > 0.9, "{kind:?}");
        let bpm = get(&s, "bpm");
        assert_eq!(bpm.value, "128");
        assert!(bpm.reasons.iter().any(|r| r.contains("4 whole bars")));
        assert_eq!(get(&s, "key").value, "a-minor");
        assert_eq!(get(&s, "instrument").value, "bass");
    }

    #[test]
    fn the_nearest_name_decides_the_instrument() {
        let facts = Facts {
            duration_ms: Some(300),
            ..Default::default()
        };
        let s = suggest(&file("Pack/Drums/Kicks/Hard 01.wav", "wav", facts), &vocab());
        let inst = get(&s, "instrument");
        assert_eq!((inst.value.as_str(), inst.origin), ("kick", "folder-name"));
        let kind = get(&s, "kind");
        assert_eq!((kind.value.as_str(), kind.origin), ("one-shots", "rule"));
        assert!(s.iter().all(|x| x.field != "bpm"), "a take number isn't a tempo");
    }

    #[test]
    fn conflicting_claims_lower_the_confidence() {
        let mut facts = Facts::default();
        facts.embedded.one_shot = Some(true);
        let s = suggest(&file("Pack/Loops/Thing.wav", "wav", facts), &vocab());
        let kind = get(&s, "kind");
        assert_eq!(kind.value, "loops");
        assert!(
            kind.confidence < 0.8 && kind.reasons.iter().any(|r| r == "but one-shots"),
            "{kind:?}"
        );
    }

    #[test]
    fn format_decides_for_non_audio_and_midi_has_a_role() {
        let mut facts = Facts {
            length_beats: Some(16.0),
            ..Default::default()
        };
        facts.embedded.key = Some("a-minor".into());
        facts.embedded.bpm = Some(120.0);
        let s = suggest(&file("Pack/MIDI/Chords.mid", "midi", facts), &vocab());
        assert_eq!(
            (get(&s, "kind").value.as_str(), get(&s, "kind").origin),
            ("midi", "rule")
        );
        assert_eq!(get(&s, "midiRole").value, "pattern");
        assert_eq!(
            (get(&s, "key").value.as_str(), get(&s, "key").origin),
            ("a-minor", "embedded")
        );
        assert_eq!(get(&s, "bpm").value, "120");
        let p = suggest(&file("Pack/Presets/Wobble.vital", "vital", Facts::default()), &vocab());
        assert_eq!(get(&p, "kind").value, "presets");
    }

    #[test]
    fn nothing_out_of_range_or_unknown() {
        let s = suggest(
            &file("Pack/Loops/Loop 999 BPM Zm.wav", "wav", Facts::default()),
            &vocab(),
        );
        assert!(s.iter().all(|x| x.field != "bpm" && x.field != "key"), "{s:?}");
    }

    #[test]
    fn what_was_heard_suggests_but_never_overrides_a_name() {
        use crate::job::{AudioAnalysis, Estimate};
        let heard = |bpm: &str, key: &str| AudioAnalysis {
            bpm: Some(Estimate {
                value: bpm.into(),
                confidence: 1.0,
                reasons: vec!["onsets".into()],
            }),
            key: Some(Estimate {
                value: key.into(),
                confidence: 1.0,
                reasons: vec!["notes".into()],
            }),
            ..Default::default()
        };
        // Nothing named: heard values are suggested, never above ANALYSIS_MAX (under the store's auto-accept).
        let mut f = file("Pack/Loops/Thing.wav", "wav", Facts::default());
        f.analysis = Some(heard("100", "a-minor"));
        let s = suggest(&f, &vocab());
        for field in ["bpm", "key"] {
            let x = get(&s, field);
            assert_eq!(x.origin, "analysis");
            assert!(x.confidence <= ANALYSIS_MAX, "{x:?}");
        }
        // Named otherwise: the name wins and the disagreement lowers it; named the same: the two add up.
        let mut f = file("Pack/Loops/Bass 140 BPM F#min.wav", "wav", Facts::default());
        f.analysis = Some(heard("100", "gs-major"));
        let s = suggest(&f, &vocab());
        assert_eq!(
            (get(&s, "bpm").value.as_str(), get(&s, "key").value.as_str()),
            ("140", "fs-minor")
        );
        assert!(get(&s, "key").reasons.iter().any(|r| r == "but gs-major"));
        let mut f = file("Pack/Loops/Bass 140 BPM F#min.wav", "wav", Facts::default());
        f.analysis = Some(heard("140", "fs-minor"));
        let s = suggest(&f, &vocab());
        assert!(get(&s, "key").confidence > 0.75);
        // Agreeing, the value is still the name's (never marked as only heard), and close tempos agree.
        assert_eq!((get(&s, "bpm").origin, get(&s, "key").origin), ("filename", "filename"));
        f.analysis = Some(heard("139.2", "fs-minor"));
        assert!(get(&suggest(&f, &vocab()), "bpm")
            .reasons
            .iter()
            .all(|r| !r.starts_with("but")));
        // The usual near misses (half time, the relative key) neither support nor question it.
        let plain = suggest(
            &file("Pack/Loops/Bass 140 BPM F#min.wav", "wav", Facts::default()),
            &vocab(),
        );
        f.analysis = Some(heard("70", "a-major"));
        let s = suggest(&f, &vocab());
        assert_eq!(get(&s, "bpm").confidence, get(&plain, "bpm").confidence);
        assert_eq!(get(&s, "key").confidence, get(&plain, "key").confidence);
    }
}
