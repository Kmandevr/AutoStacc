// Technical facts read straight from a file's own headers: never guessed. Works on the first bytes of a file (`head`,
// up to HEAD_BYTES) plus its total length, so the server can re-check a stored file with one small range read.
// Embedded claims (an ACID tempo, a MIDI key signature) are reported separately from facts: someone wrote them.
use serde::Serialize;

/// How much of a file the fact readers look at.
pub const HEAD_BYTES: usize = 1 << 20;
/// MIDI files are read whole up to this size (they're tiny; bigger ones get header facts only).
pub const MIDI_MAX: usize = 4 << 20;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Facts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u16>,
    /// "pcm", "float", "mp3", … (the encoding inside the container).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    // MIDI
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_format: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_tracks: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ppq: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_notes: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length_beats: Option<f64>,
    /// Things written into the file by whoever made it (tempo, key, one-shot flag): claims, not facts.
    #[serde(skip_serializing_if = "Embedded::is_empty")]
    pub embedded: Embedded,
    /// Why some facts are missing (damaged or unusual header), for the review screen.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub problems: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Embedded {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_shot: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_points: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_note: Option<u8>,
}

impl Embedded {
    pub fn is_empty(&self) -> bool {
        *self == Embedded::default()
    }
}

fn u16le(b: &[u8], o: usize) -> Option<u16> {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}
fn u32le(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}
fn u64le(b: &[u8], o: usize) -> Option<u64> {
    b.get(o..o + 8).map(|s| u64::from_le_bytes(s.try_into().unwrap()))
}
fn u16be(b: &[u8], o: usize) -> Option<u16> {
    b.get(o..o + 2).map(|s| u16::from_be_bytes([s[0], s[1]]))
}
fn u32be(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
}

/// Facts for a file already identified as `format` (see formats.rs). Unknown formats give empty facts.
pub fn extract(format: &str, head: &[u8], total_len: u64) -> Facts {
    match format {
        "wav" => wav(head, total_len),
        "aiff" => aiff(head),
        "flac" => flac(head),
        "midi" => midi(head),
        _ => Facts::default(),
    }
}

const NOTE_NAMES: [&str; 12] = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];

fn wav(b: &[u8], total_len: u64) -> Facts {
    let mut f = Facts::default();
    let rf64 = b.starts_with(b"RF64") || b.starts_with(b"BW64");
    let mut ds64_data: Option<u64> = None;
    let (mut block_align, mut data_size): (u16, Option<u64>) = (0, None);
    let mut off = 12usize;
    while off + 8 <= b.len() {
        let id = &b[off..off + 4];
        let size = u32le(b, off + 4).unwrap() as u64;
        let body = off + 8;
        match id {
            b"ds64" => ds64_data = u64le(b, body + 8),
            b"fmt " => {
                let tag = u16le(b, body).unwrap_or(0);
                f.channels = u16le(b, body + 2);
                f.sample_rate = u32le(b, body + 4);
                block_align = u16le(b, body + 12).unwrap_or(0);
                f.bit_depth = u16le(b, body + 14);
                // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID.
                let real = if tag == 0xfffe {
                    u16le(b, body + 24).unwrap_or(0)
                } else {
                    tag
                };
                f.encoding = Some(
                    match real {
                        1 => "pcm",
                        3 => "float",
                        0x55 => "mp3",
                        2 => "adpcm",
                        6 => "alaw",
                        7 => "mulaw",
                        _ => "other",
                    }
                    .into(),
                );
            }
            b"data" => {
                data_size = Some(if rf64 && size == 0xffff_ffff {
                    ds64_data.unwrap_or(0)
                } else {
                    size
                });
                break; // audio follows; any later chunks (acid, smpl) are usually before it, else beyond the head
            }
            b"acid" => {
                // flags u32, root note u16, 2 unknown u16 + f32, beats u32, meter denominator u16, numerator u16, tempo f32
                if let Some(flags) = u32le(b, body) {
                    f.embedded.one_shot = Some(flags & 1 == 1);
                }
                if let (Some(den), Some(num)) = (u16le(b, body + 16), u16le(b, body + 18)) {
                    if num > 0 && den > 0 && num <= 32 && den <= 32 {
                        f.embedded.time_signature = Some(format!("{num}/{den}"));
                    }
                }
                if let Some(t) = u32le(b, body + 20).map(f32::from_bits) {
                    if t.is_finite() && (20.0..=400.0).contains(&t) {
                        f.embedded.bpm = Some((t as f64 * 100.0).round() / 100.0);
                    }
                }
                if let Some(root) = u16le(b, body + 4) {
                    if (1..=127).contains(&root) {
                        f.embedded.root_note = Some(root as u8);
                    }
                }
            }
            b"smpl" => {
                if let Some(n) = u32le(b, body + 28) {
                    f.embedded.loop_points = Some(n > 0);
                }
                if let Some(unity) = u32le(b, body + 12) {
                    if (1..=127).contains(&unity) && f.embedded.root_note.is_none() {
                        f.embedded.root_note = Some(unity as u8);
                    }
                }
            }
            _ => {}
        }
        off = body.saturating_add(size as usize + (size as usize & 1));
    }
    match (f.sample_rate, data_size) {
        (Some(sr), Some(ds)) if sr > 0 && block_align > 0 => {
            let ds = if ds == 0 || ds > total_len {
                total_len.saturating_sub(off as u64 + 8)
            } else {
                ds
            };
            f.duration_ms = Some(ds / block_align as u64 * 1000 / sr as u64);
        }
        _ => f.problems.push("no readable fmt/data header".into()),
    }
    f
}

/// 80-bit IEEE extended (AIFF sample rate).
fn ext80(b: &[u8]) -> Option<f64> {
    let exp = (u16be(b, 0)? & 0x7fff) as i32;
    let mant = u64::from_be_bytes(b.get(2..10)?.try_into().ok()?);
    if exp == 0 && mant == 0 {
        return Some(0.0);
    }
    Some(mant as f64 * 2f64.powi(exp - 16383 - 63))
}

fn aiff(b: &[u8]) -> Facts {
    let mut f = Facts::default();
    let mut off = 12usize;
    while off + 8 <= b.len() {
        let id = &b[off..off + 4];
        let size = u32be(b, off + 4).unwrap() as usize;
        let body = off + 8;
        if id == b"COMM" {
            f.channels = u16be(b, body);
            let frames = u32be(b, body + 2);
            f.bit_depth = u16be(b, body + 6);
            let sr = b.get(body + 8..body + 18).and_then(ext80);
            if let Some(sr) = sr.filter(|s| *s > 0.0 && *s < 1e7) {
                f.sample_rate = Some(sr.round() as u32);
                if let Some(fr) = frames {
                    f.duration_ms = Some((fr as f64 * 1000.0 / sr) as u64);
                }
            }
            f.encoding = Some(
                if b.get(8..12) == Some(b"AIFC") {
                    match b.get(body + 18..body + 22) {
                        Some(b"fl32") | Some(b"FL32") | Some(b"fl64") => "float",
                        Some(b"NONE") | Some(b"sowt") => "pcm",
                        _ => "other",
                    }
                } else {
                    "pcm"
                }
                .into(),
            );
            return f;
        }
        off = body.saturating_add(size + (size & 1));
    }
    f.problems.push("no COMM chunk".into());
    f
}

fn flac(b: &[u8]) -> Facts {
    let mut f = Facts::default();
    // STREAMINFO is the first metadata block: 4-byte block header after "fLaC", then 34 bytes.
    let si = 8;
    if b.len() < si + 18 || b[4] & 0x7f != 0 {
        f.problems.push("no STREAMINFO".into());
        return f;
    }
    let x = u64::from_be_bytes(b[si + 10..si + 18].try_into().unwrap());
    let sr = (x >> 44) as u32;
    let ch = ((x >> 41) & 7) as u16 + 1;
    let bps = ((x >> 36) & 31) as u16 + 1;
    let samples = x & 0xf_ffff_ffff;
    f.sample_rate = Some(sr);
    f.channels = Some(ch);
    f.bit_depth = Some(bps);
    f.encoding = Some("flac".into());
    if sr > 0 && samples > 0 {
        f.duration_ms = Some(samples * 1000 / sr as u64);
    }
    f
}

fn varlen(b: &[u8], p: &mut usize) -> Option<u32> {
    let mut v = 0u32;
    for _ in 0..4 {
        let c = *b.get(*p)?;
        *p += 1;
        v = (v << 7) | (c & 0x7f) as u32;
        if c & 0x80 == 0 {
            return Some(v);
        }
    }
    None
}

fn midi(b: &[u8]) -> Facts {
    let mut f = Facts::default();
    let (Some(hlen), Some(fmt), Some(ntrks), Some(div)) = (u32be(b, 4), u16be(b, 8), u16be(b, 10), u16be(b, 12)) else {
        f.problems.push("short MIDI header".into());
        return f;
    };
    f.midi_format = Some(fmt);
    f.midi_tracks = Some(ntrks);
    if div & 0x8000 == 0 && div > 0 {
        f.ppq = Some(div);
    }
    let mut off = 8 + hlen as usize;
    let (mut notes, mut max_tick) = (0u32, 0u64);
    let mut tempo_us: Option<u32> = None;
    for _ in 0..ntrks {
        if off + 8 > b.len() || &b[off..off + 4] != b"MTrk" {
            break;
        }
        let len = u32be(b, off + 4).unwrap() as usize;
        let end = (off + 8).saturating_add(len).min(b.len());
        let mut p = off + 8;
        let (mut tick, mut status) = (0u64, 0u8);
        while p < end {
            let Some(d) = varlen(b, &mut p) else { break };
            tick += d as u64;
            let Some(&first) = b.get(p) else { break };
            if first == 0xff {
                let ty = *b.get(p + 1).unwrap_or(&0);
                p += 2;
                let Some(ml) = varlen(b, &mut p) else { break };
                let data = b.get(p..p + ml as usize).unwrap_or(&[]);
                match (ty, data.len()) {
                    (0x51, 3) if tempo_us.is_none() => {
                        tempo_us = Some(((data[0] as u32) << 16) | ((data[1] as u32) << 8) | data[2] as u32)
                    }
                    (0x58, 4) if f.embedded.time_signature.is_none() && data[1] < 6 => {
                        f.embedded.time_signature = Some(format!("{}/{}", data[0], 1u32 << data[1]))
                    }
                    (0x59, 2) if f.embedded.key.is_none() => {
                        let sf = data[0] as i8;
                        let minor = data[1] == 1;
                        if (-7..=7).contains(&sf) {
                            let major_tonic = ((sf as i32 * 7) % 12 + 12) % 12;
                            let tonic = if minor { (major_tonic + 9) % 12 } else { major_tonic };
                            f.embedded.key = Some(format!(
                                "{}-{}",
                                NOTE_NAMES[tonic as usize],
                                if minor { "minor" } else { "major" }
                            ));
                        }
                    }
                    _ => {}
                }
                p += ml as usize;
                if ty == 0x2f {
                    break;
                }
                continue;
            }
            if first == 0xf0 || first == 0xf7 {
                p += 1;
                let Some(sl) = varlen(b, &mut p) else { break };
                p += sl as usize;
                continue;
            }
            if first & 0x80 != 0 {
                status = first;
                p += 1;
            } else if status == 0 {
                break; // running status with nothing to run: damaged track
            }
            let kind = status & 0xf0;
            let n = if kind == 0xc0 || kind == 0xd0 { 1 } else { 2 };
            if kind == 0x90 && b.get(p + 1).copied().unwrap_or(0) > 0 {
                notes += 1;
            }
            p += n;
        }
        max_tick = max_tick.max(tick);
        off = (off + 8).saturating_add(len);
    }
    f.midi_notes = Some(notes);
    if let Some(ppq) = f.ppq {
        let beats = max_tick as f64 / ppq as f64;
        f.length_beats = Some((beats * 100.0).round() / 100.0);
        let us = tempo_us.unwrap_or(500_000) as f64;
        f.duration_ms = Some((beats * us / 1000.0) as u64);
    }
    if let Some(us) = tempo_us.filter(|u| *u > 0) {
        f.embedded.bpm = Some(((60_000_000.0 / us as f64) * 100.0).round() / 100.0);
    }
    f
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A minimal PCM WAV: `frames` frames of silence, plus an optional ACID chunk (tempo, one-shot flag).
    pub fn wav_bytes(sr: u32, ch: u16, bits: u16, frames: u32, acid: Option<(f32, bool)>) -> Vec<u8> {
        let align = ch * bits / 8;
        let data_len = frames * align as u32;
        let mut v = Vec::new();
        v.extend_from_slice(b"RIFF\0\0\0\0WAVE");
        v.extend_from_slice(b"fmt \x10\0\0\0");
        v.extend_from_slice(&1u16.to_le_bytes());
        v.extend_from_slice(&ch.to_le_bytes());
        v.extend_from_slice(&sr.to_le_bytes());
        v.extend_from_slice(&(sr * align as u32).to_le_bytes());
        v.extend_from_slice(&align.to_le_bytes());
        v.extend_from_slice(&bits.to_le_bytes());
        if let Some((tempo, one_shot)) = acid {
            v.extend_from_slice(b"acid\x18\0\0\0");
            v.extend_from_slice(&(one_shot as u32).to_le_bytes());
            v.extend_from_slice(&60u16.to_le_bytes());
            v.extend_from_slice(&[0; 6]);
            v.extend_from_slice(&8u32.to_le_bytes());
            v.extend_from_slice(&4u16.to_le_bytes());
            v.extend_from_slice(&4u16.to_le_bytes());
            v.extend_from_slice(&tempo.to_bits().to_le_bytes());
        }
        v.extend_from_slice(b"data");
        v.extend_from_slice(&data_len.to_le_bytes());
        v.resize(v.len() + data_len as usize, 0);
        let riff = (v.len() - 8) as u32;
        v[4..8].copy_from_slice(&riff.to_le_bytes());
        v
    }

    #[test]
    fn wav_facts_and_acid_claims() {
        let w = wav_bytes(48_000, 2, 24, 96_000, Some((128.0, false)));
        let f = extract("wav", &w, w.len() as u64);
        assert_eq!(
            (f.sample_rate, f.channels, f.bit_depth, f.duration_ms),
            (Some(48_000), Some(2), Some(24), Some(2000))
        );
        assert_eq!(f.encoding.as_deref(), Some("pcm"));
        assert_eq!(f.embedded.bpm, Some(128.0));
        assert_eq!(f.embedded.one_shot, Some(false));
        assert_eq!(f.embedded.time_signature.as_deref(), Some("4/4"));
    }

    #[test]
    fn damaged_wav_reports_a_problem_instead_of_guessing() {
        let f = extract("wav", b"RIFF\0\0\0\0WAVEjunk", 16);
        assert_eq!(f.duration_ms, None);
        assert!(!f.problems.is_empty());
    }

    #[test]
    fn aiff_facts() {
        let mut v = b"FORM\0\0\0\0AIFFCOMM\0\0\0\x12".to_vec();
        v.extend_from_slice(&1u16.to_be_bytes());
        v.extend_from_slice(&44_100u32.to_be_bytes());
        v.extend_from_slice(&16u16.to_be_bytes());
        v.extend_from_slice(&[0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]); // 44100 as 80-bit extended
        let f = extract("aiff", &v, v.len() as u64);
        assert_eq!(
            (f.sample_rate, f.channels, f.bit_depth, f.duration_ms),
            (Some(44_100), Some(1), Some(16), Some(1000))
        );
    }

    #[test]
    fn midi_facts_and_claims() {
        // format 0, 1 track, 96 ppq; tempo 120 bpm (500000 µs), 4/4, A minor, two notes over 8 beats.
        let mut t = vec![
            0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8, 0x00, 0xff, 0x59, 0x02, 0, 1,
        ];
        t.extend_from_slice(&[0x00, 0x90, 60, 100, 0x83, 0x00, 0x80, 60, 0, 0x00, 0x90, 64, 100]);
        t.extend_from_slice(&[0x83, 0x00, 0x80, 64, 0, 0x00, 0xff, 0x2f, 0x00]);
        let mut v = b"MThd\0\0\0\x06\0\0\0\x01\0\x60MTrk".to_vec();
        v.extend_from_slice(&(t.len() as u32).to_be_bytes());
        v.extend_from_slice(&t);
        let f = extract("midi", &v, v.len() as u64);
        assert_eq!(
            (f.midi_format, f.midi_tracks, f.ppq, f.midi_notes),
            (Some(0), Some(1), Some(96), Some(2))
        );
        assert_eq!(f.embedded.bpm, Some(120.0));
        assert_eq!(f.embedded.time_signature.as_deref(), Some("4/4"));
        assert_eq!(f.embedded.key.as_deref(), Some("a-minor"));
        assert_eq!(f.length_beats, Some(8.0));
        assert_eq!(f.duration_ms, Some(4000));
    }
}
