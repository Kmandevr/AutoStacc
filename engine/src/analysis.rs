// Audio analysis (docs/engine.md, "Analysis"; docs/packs.md Phase 8): from the start of an audio file (up to
// ANALYZE_SECONDS, decoded with symphonia), a tempo, a key and a waveform outline. Server side only (never in the
// WebAssembly build) and only when a job asks for it. Everything here is a suggestion with a confidence, never a fact:
// - tempo: onsets from spectral flux, their autocorrelation between 60 and 200 BPM with a gentle preference for the
//   middle, the octave (half or double) that explains the onsets best, and, when the whole file was decoded, snapped to
//   a whole number of bars when that's close (loops are cut to bars). None for one-shots and sounds without a pulse.
// - key: a chroma profile (energy per pitch class, 55 Hz to 2 kHz) matched against the 24 major and minor key profiles
//   (Krumhansl-Kessler); None when the sound isn't tonal enough to tell.
// - peaks: the loudest sample in each of PEAKS slices of what was decoded, 0 to 100, to draw a waveform.
use crate::job::{AudioAnalysis, Estimate};
use rustfft::{num_complex::Complex, FftPlanner};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// How much of each file is analysed, and the most bytes kept to decode it (a 30 s stereo 24-bit 96 kHz file is 17 MB).
pub const ANALYZE_SECONDS: f64 = 30.0;
pub const ANALYZE_BYTES: usize = 24 << 20;
pub const PEAKS: usize = 100;
const RATE: f64 = 11025.0; // audio is brought down to about this rate first
const FRAME: usize = 1024; // spectral frame for onsets (about 93 ms)
const HOP: usize = 128; // between onset frames (about 11.6 ms)
const CHROMA_FRAME: usize = 4096; // spectral frame for pitch (2.7 Hz per bin)

/// Decodes the start of a file (its bytes so far, maybe cut short) to mono samples. complete: these are all its bytes.
pub fn decode(ext: &str, bytes: Vec<u8>) -> Option<(Vec<f32>, f64, bool)> {
    let mss = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(bytes)),
        MediaSourceStreamOptions::default(),
    );
    let mut hint = Hint::new();
    hint.with_extension(ext);
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .ok()?;
    let mut format = probed.format;
    let track = format.default_track()?.clone();
    let rate = track.codec_params.sample_rate? as f64;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .ok()?;
    let want = (ANALYZE_SECONDS * rate) as usize;
    let mut mono: Vec<f32> = Vec::with_capacity(want.min(1 << 22));
    let mut ended = false;
    while mono.len() < want {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => {
                ended = true;
                break;
            }
        };
        if packet.track_id() != track.id {
            continue;
        }
        let Ok(buf) = decoder.decode(&packet) else { continue };
        let spec = *buf.spec();
        let ch = spec.channels.count().max(1);
        let mut sb = SampleBuffer::<f32>::new(buf.capacity() as u64, spec);
        sb.copy_interleaved_ref(buf);
        for frame in sb.samples().chunks(ch) {
            mono.push(frame.iter().sum::<f32>() / ch as f32);
        }
    }
    mono.truncate(want);
    if mono.is_empty() {
        return None;
    }
    Some((mono, rate, ended))
}

/// Analyses mono samples at `rate`. whole: the samples are the entire file (so its length can be trusted for bars).
pub fn analyze_samples(mono: &[f32], rate: f64, whole: bool) -> AudioAnalysis {
    let analyzed_ms = (mono.len() as f64 / rate * 1000.0) as u64;
    let peaks = peaks(mono);
    // Silent only when all of it was heard: stems and long files are often quiet for their first 30 s.
    let silent = whole && mono.iter().all(|v| v.abs() < SILENT);
    let (low, low_rate) = downsample(&normalized(mono), rate);
    AudioAnalysis {
        bpm: tempo(&low, low_rate, whole),
        key: key(&low, low_rate),
        peaks,
        analyzed_ms,
        silent,
    }
}

/// -60 dBFS: quieter than this throughout is silence (or a file rendered without its sound).
const SILENT: f32 = 0.001;

/// Decodes and analyses (None when the file can't be decoded). A decoder that panics on a crafted file (the release
/// build unwinds for this) counts as a file that doesn't decode, never as a crashed job.
pub fn analyze(ext: &str, bytes: Vec<u8>, complete: bool) -> Option<AudioAnalysis> {
    // Quiet while it runs (the engine runs one job at a time): a caught panic is an answer, not an error to log.
    let loud = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let out = std::panic::catch_unwind(move || {
        let (mono, rate, ended) = decode(ext, bytes)?;
        // The whole file was heard only if its bytes were all here and decoding ran to the end of them.
        Some(analyze_samples(&mono, rate, complete && ended))
    });
    std::panic::set_hook(loud);
    out.ok().flatten()
}

// Scaled so the loudest sample is 1: the measures below then don't depend on how loud a file was mastered.
fn normalized(x: &[f32]) -> Vec<f32> {
    let max = x.iter().fold(0f32, |m, v| m.max(v.abs()));
    if max > 0.0 {
        x.iter().map(|v| v / max).collect()
    } else {
        x.to_vec()
    }
}

fn peaks(x: &[f32]) -> Vec<u8> {
    if x.is_empty() {
        return Vec::new();
    }
    let max = x.iter().fold(0f32, |m, v| m.max(v.abs())).max(1e-9);
    (0..PEAKS)
        .map(|i| {
            let (a, b) = (
                i * x.len() / PEAKS,
                ((i + 1) * x.len() / PEAKS).max(i * x.len() / PEAKS + 1).min(x.len()),
            );
            let p = x[a..b].iter().fold(0f32, |m, v| m.max(v.abs()));
            (p / max * 100.0).round() as u8
        })
        .collect()
}

// An integer-factor decimation to about RATE, with a moving average in front against aliasing.
fn downsample(x: &[f32], rate: f64) -> (Vec<f32>, f64) {
    let factor = ((rate / RATE).round() as usize).max(1);
    if factor == 1 {
        return (x.to_vec(), rate);
    }
    let out = x
        .chunks(factor)
        .map(|c| c.iter().sum::<f32>() / c.len() as f32)
        .collect();
    (out, rate / factor as f64)
}

fn hann(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos())
        .collect()
}

// Magnitude spectra of frames `size` long, `hop` apart.
fn spectra(x: &[f32], size: usize, hop: usize) -> Vec<Vec<f32>> {
    if x.len() < size {
        return Vec::new();
    }
    let fft = FftPlanner::<f32>::new().plan_fft_forward(size);
    let w = hann(size);
    let mut out = Vec::new();
    let mut buf = vec![Complex::new(0.0, 0.0); size];
    let mut start = 0;
    while start + size <= x.len() {
        for i in 0..size {
            buf[i] = Complex::new(x[start + i] * w[i], 0.0);
        }
        fft.process(&mut buf);
        out.push(buf[..size / 2].iter().map(|c| c.norm()).collect());
        start += hop;
    }
    out
}

// Spectral flux on log magnitudes (how much louder each frame got, summed over frequencies), and its mean.
fn onsets(x: &[f32], rate: f64) -> Option<(Vec<f64>, f64)> {
    let _ = rate;
    let spec = spectra(x, FRAME, HOP);
    if spec.len() < 64 {
        return None;
    }
    let mut flux: Vec<f64> = Vec::with_capacity(spec.len());
    let mut prev: Vec<f32> = spec[0].iter().map(|m| (1.0 + 100.0 * m).ln()).collect();
    flux.push(0.0);
    for s in &spec[1..] {
        let cur: Vec<f32> = s.iter().map(|m| (1.0 + 100.0 * m).ln()).collect();
        flux.push(cur.iter().zip(&prev).map(|(c, p)| (c - p).max(0.0) as f64).sum());
        prev = cur;
    }
    let mean = flux.iter().sum::<f64>() / flux.len() as f64;
    if mean < 1e-6 {
        return None;
    }
    Some((flux, mean))
}

// The strongest normalized autocorrelation of the onsets between 60 and 200 BPM: how regular they are.
fn regularity(flux: &[f64], rate: f64) -> f64 {
    let mean = flux.iter().sum::<f64>() / flux.len() as f64;
    let o: Vec<f64> = flux.iter().map(|f| f - mean).collect();
    let e: f64 = o.iter().map(|v| v * v).sum();
    let fps = rate / HOP as f64;
    let (lo, hi) = ((60.0 * fps / 200.0) as usize, (60.0 * fps / 60.0) as usize);
    if e <= 0.0 || hi >= o.len() {
        return 0.0;
    }
    (lo..=hi)
        .map(|l| o.iter().zip(&o[l..]).map(|(a, b)| a * b).sum::<f64>() / e)
        .fold(f64::MIN, f64::max)
}

fn tempo(x: &[f32], rate: f64, whole: bool) -> Option<Estimate> {
    let seconds = x.len() as f64 / rate;
    if seconds < 1.5 {
        return None;
    }
    let (flux, mean) = onsets(x, rate)?;
    // No pulse to measure: too little change (a held pad) or change with no regularity (noise).
    if mean / ((FRAME / 2) as f64) < MIN_CHANGE || regularity(&flux, rate) < MIN_REGULARITY {
        return None;
    }
    let onset: Vec<f64> = flux.iter().map(|f| f - mean).collect();
    let fps = rate / HOP as f64;
    let lag_of = |bpm: f64| 60.0 * fps / bpm;
    let (min_lag, max_lag) = (lag_of(200.0).floor() as usize, lag_of(60.0).ceil() as usize);
    if max_lag * 2 >= onset.len() {
        return None;
    }
    let energy: f64 = onset.iter().map(|v| v * v).sum();
    if energy <= 0.0 {
        return None;
    }
    let acf = |lag: usize| -> f64 { onset.iter().zip(&onset[lag..]).map(|(a, b)| a * b).sum::<f64>() / energy };
    let raw: Vec<f64> = (0..=max_lag * 2 + 1)
        .map(|l| if l < onset.len() { acf(l) } else { 0.0 })
        .collect();
    // A beat at this lag explains its own peak and, less, the one at twice the lag: score lags that way, with a mild
    // log-normal preference around 120 BPM so octave errors lean towards the usual range.
    let score = |lag: usize| -> f64 {
        let bpm = 60.0 * fps / lag as f64;
        let prior = (-(bpm / 120.0).log2().powi(2) / (2.0 * 0.9f64.powi(2))).exp();
        (raw[lag] + 0.5 * raw[(lag * 2).min(raw.len() - 1)]) * (0.6 + 0.4 * prior)
    };
    let (mut best, best_score) =
        (min_lag..=max_lag)
            .map(|l| (l, score(l)))
            .fold((0, f64::MIN), |a, b| if b.1 > a.1 { b } else { a });
    if best == 0 || best_score <= 0.0 {
        return None;
    }
    // Half or double time nearly as strong (hats on every half beat make 80 and 160 both fit): the signal can't tell
    // which the creator means. Take the one nearer the usual range, but say so and be much less sure.
    let peak_at = |lag: usize| {
        (lag.saturating_sub(1)..=(lag + 1).min(raw.len() - 1))
            .max_by(|a, b| raw[*a].partial_cmp(&raw[*b]).unwrap())
            .unwrap()
    };
    let mut rivals: Vec<usize> = Vec::new();
    for alt in [best / 2, best * 2] {
        if alt >= min_lag && alt <= max_lag {
            let a = peak_at(alt);
            if raw[a] >= OCTAVE_RIVAL * raw[best] {
                rivals.push(a);
            }
        }
    }
    let typical = |lag: usize| (60.0 * fps / lag as f64 / 120.0).log2().abs();
    if let Some(&closer) = rivals
        .iter()
        .filter(|&&a| typical(a) < typical(best))
        .min_by(|a, b| typical(**a).partial_cmp(&typical(**b)).unwrap())
    {
        rivals.retain(|&a| a != closer);
        rivals.push(best);
        best = closer;
    }
    // Sub-frame precision from the peak's neighbours.
    let (a, b, c) = (raw[best - 1], raw[best], raw[best + 1]);
    let shift = if a - 2.0 * b + c != 0.0 {
        0.5 * (a - c) / (a - 2.0 * b + c)
    } else {
        0.0
    };
    let mut bpm = 60.0 * fps / (best as f64 + shift.clamp(-0.5, 0.5));
    let mut reasons = vec!["the onsets repeat at this tempo".to_string()];
    // How much the winning lag stands out from the rest of the range.
    let rest: Vec<f64> = (min_lag..=max_lag)
        .filter(|l| l.abs_diff(best) > 2)
        .map(|l| raw[l])
        .collect();
    let rest_mean = rest.iter().sum::<f64>() / rest.len().max(1) as f64;
    let rest_max = rest.iter().cloned().fold(f64::MIN, f64::max);
    let clarity = ((raw[best] - rest_mean) / (raw[best].abs() + 1e-9)).clamp(0.0, 1.0);
    let margin = ((raw[best] - rest_max.max(0.0)) / (raw[best].abs() + 1e-9)).clamp(0.0, 1.0);
    let mut confidence = 0.35 * clarity + 0.35 * margin + 0.3 * raw[best].clamp(0.0, 1.0);
    // A loop's length is a whole number of bars: if a whole-bar count at a nearby tempo fits within 2%, that's the tempo.
    if whole {
        let beats = seconds * bpm / 60.0;
        let bars = (beats / 4.0).round();
        if bars >= 1.0 {
            let fitted = bars * 4.0 * 60.0 / seconds;
            if (fitted / bpm - 1.0).abs() <= 0.02 && (60.0..=200.0).contains(&fitted) {
                bpm = fitted;
                confidence = (confidence + 0.25).min(1.0);
                reasons.push(format!(
                    "the loop is {} bar{} long at this tempo",
                    bars,
                    if bars == 1.0 { "" } else { "s" }
                ));
            }
        }
    }
    if confidence < MIN_TEMPO_CONFIDENCE {
        return None;
    }
    if !rivals.is_empty() {
        confidence *= OCTAVE_PENALTY;
        let alt: Vec<String> = rivals
            .iter()
            .map(|&l| format!("{:.0}", 60.0 * fps / l as f64))
            .collect();
        reasons.push(format!("or {} (half or double time)", alt.join(" or ")));
    }
    // Whole numbers when close (tempos are usually set as whole numbers), else one decimal.
    let rounded = (bpm * 10.0).round() / 10.0;
    let value = if (rounded - rounded.round()).abs() < 0.15 {
        format!("{}", rounded.round())
    } else {
        format!("{rounded:.1}")
    };
    Some(Estimate {
        value,
        confidence: (confidence * 100.0).round() / 100.0,
        reasons,
    })
}

// Krumhansl-Kessler key profiles (major, minor), from the tonic up.
const MAJOR: [f64; 12] = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR: [f64; 12] = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAX_FLATNESS: f64 = 0.5;
const MIN_ABOVE_BASS: f64 = 0.25;
const BASS_WEIGHT: f64 = 0.3;
/// Under this (before any half-or-double-time penalty), a tempo is too unsure to say at all.
const MIN_TEMPO_CONFIDENCE: f64 = 0.5;
/// A half or double tempo at least this strong is a real rival; the estimate then keeps this much of its confidence.
const OCTAVE_RIVAL: f64 = 0.8;
const OCTAVE_PENALTY: f64 = 0.6;
/// No pulse under these: the onsets' mean change per frequency bin (audio peak-normalized; a held pad has about 0.01,
/// drums 0.06 and up) and their regularity (noise about 0.1, anything with a beat 0.7 and up).
const MIN_CHANGE: f64 = 0.02;
const MIN_REGULARITY: f64 = 0.3;
const NAMES: [&str; 12] = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
const LABELS: [&str; 12] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

fn correlation(a: &[f64; 12], b: &[f64]) -> f64 {
    let (ma, mb) = (a.iter().sum::<f64>() / 12.0, b.iter().sum::<f64>() / 12.0);
    let (mut num, mut da, mut db) = (0.0, 0.0, 0.0);
    for i in 0..12 {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma).powi(2);
        db += (b[i] - mb).powi(2);
    }
    if da <= 0.0 || db <= 0.0 {
        0.0
    } else {
        num / (da * db).sqrt()
    }
}

/// The pitch content of a sound: energy per pitch class (55 Hz to 2 kHz) over all of it and in the bass (under
/// 260 Hz, where a key's tonic tends to sit), and how tonal it is (the energy-weighted spectral flatness of its frames:
/// near 0 for clear pitches, near 1 for noise and drums).
struct Pitch {
    all: [f64; 12],
    bass: [f64; 12],
    flatness: f64,
    /// The share of pitched energy above the bass: harmony has some, a kick drum's pitch has almost none.
    above_bass: f64,
}

fn pitch_class(f: f64) -> usize {
    ((12.0 * (f / 440.0).log2()).round() as i64 + 9).rem_euclid(12) as usize // A = 9
}

fn pitch(x: &[f32], rate: f64) -> Option<Pitch> {
    let spec = spectra(x, CHROMA_FRAME, CHROMA_FRAME / 2);
    if spec.len() < 4 {
        return None;
    }
    let bin_hz = rate / CHROMA_FRAME as f64;
    let (lo, hi) = (
        (55.0 / bin_hz) as usize,
        ((2000.0 / bin_hz) as usize).min(spec[0].len() - 2),
    );
    let (mut all, mut bass) = ([0f64; 12], [0f64; 12]);
    let (mut pitched, mut high) = (0.0, 0.0);
    let (mut flat_sum, mut weight) = (0.0, 0.0);
    let opening = (spec.len() / 8).max(1);
    for (frame, s) in spec.iter().enumerate() {
        let band = &s[lo..=hi];
        let energy: f64 = band.iter().map(|m| (*m as f64).powi(2)).sum();
        if energy <= 1e-12 {
            continue;
        }
        let n = band.len() as f64;
        let geo = (band.iter().map(|m| ((*m as f64) + 1e-12).ln()).sum::<f64>() / n).exp();
        let arith = band.iter().map(|m| *m as f64).sum::<f64>() / n;
        flat_sum += energy * (geo / arith.max(1e-12));
        weight += energy;
        // The frame's bass note: its lowest clear peak under 260 Hz within 12 dB of the loudest one there (a chord's
        // upper notes and a root's overtones sit above it). It gets the frame's bass energy, and counts double in the
        // opening eighth of the sound, where a loop most often sits on its tonic.
        let low_peaks: Vec<usize> = (lo.max(1)..=hi)
            .filter(|&k| (k as f64 * bin_hz) < 260.0 && s[k] >= s[k - 1] && s[k] >= s[k + 1])
            .collect();
        let loudest = low_peaks.iter().map(|&k| s[k]).fold(0f32, f32::max);
        if let Some(&k) = low_peaks.iter().find(|&&k| s[k] >= loudest * 0.25) {
            let e: f64 = low_peaks.iter().map(|&k| (s[k] as f64).powi(2)).sum();
            bass[pitch_class(k as f64 * bin_hz)] += if frame < opening { 2.0 * e } else { e };
        }
        // Only each frame's clear peaks count (a bin louder than its neighbours), so noise spreads less evenly.
        for k in lo.max(1)..=hi {
            if s[k] < s[k - 1] || s[k] < s[k + 1] {
                continue;
            }
            let f = k as f64 * bin_hz;
            let e = (s[k] as f64).powi(2);
            all[pitch_class(f)] += e;
            pitched += e;
            if f >= 260.0 {
                high += e;
            }
        }
    }
    if weight <= 0.0 {
        return None;
    }
    let norm = |c: [f64; 12]| {
        let t: f64 = c.iter().sum();
        if t > 0.0 {
            c.map(|v| v / t)
        } else {
            c
        }
    };
    Some(Pitch {
        all: norm(all),
        bass: norm(bass),
        flatness: flat_sum / weight,
        above_bass: if pitched > 0.0 { high / pitched } else { 0.0 },
    })
}

/// For tuning (examples/analyze.rs): the measures behind the estimates.
pub fn measures(mono: &[f32], rate: f64) -> String {
    let (low, low_rate) = downsample(&normalized(mono), rate);
    let per_bin = onsets(&low, low_rate).map(|o| o.1 / (FRAME / 2) as f64).unwrap_or(0.0);
    let regular = onsets(&low, low_rate)
        .map(|o| regularity(&o.0, low_rate))
        .unwrap_or(0.0);
    let pitch_text = measures_pitch(&low, low_rate);
    format!("flux/bin {per_bin:.4}, regular {regular:.2}; {pitch_text}")
}

fn measures_pitch(low: &[f32], low_rate: f64) -> String {
    match pitch(low, low_rate) {
        Some(p) => format!(
            "flatness {:.3}, above bass {:.2}, chroma {:?}, bass {:?}",
            p.flatness,
            p.above_bass,
            p.all.map(|v| (v * 100.0).round()),
            p.bass.map(|v| (v * 100.0).round())
        ),
        None => "no pitch".into(),
    }
}

fn key(x: &[f32], rate: f64) -> Option<Estimate> {
    let p = pitch(x, rate)?;
    let top = p.all.iter().cloned().fold(0.0, f64::max);
    // No key worth saying for noise (flat spectrum), for drums (their only pitch is a kick's, in the bass) or for a
    // chroma spread over everything.
    if top < 0.13 || p.flatness > MAX_FLATNESS || p.above_bass < MIN_ABOVE_BASS {
        return None;
    }
    // Each key's fit, plus what the bass says about its tonic (a minor key and its relative major share their notes;
    // the bass usually sits on the tonic).
    let mut scores: Vec<(f64, usize, bool)> = Vec::with_capacity(24);
    for tonic in 0..12 {
        let rotated: Vec<f64> = (0..12).map(|i| p.all[(i + tonic) % 12]).collect();
        let bass = BASS_WEIGHT * p.bass[tonic];
        scores.push((correlation(&MAJOR, &rotated) + bass, tonic, false));
        scores.push((correlation(&MINOR, &rotated) + bass, tonic, true));
    }
    scores.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    let (best, tonic, minor) = scores[0];
    if best < 0.5 {
        return None;
    }
    // Sure only when it stands out from the runner-up and, above all, from its relative key, which shares its notes
    // and is the usual mistake.
    let relative = if minor {
        ((tonic + 3) % 12, false)
    } else {
        ((tonic + 9) % 12, true)
    };
    let rel = scores
        .iter()
        .find(|s| (s.1, s.2) == relative)
        .map(|s| s.0)
        .unwrap_or(0.0);
    let gap = (best - scores[1].0).max(0.0);
    let confidence = (0.5 * best + 2.5 * gap).min(4.0 * (best - rel)).clamp(0.0, 1.0);
    let value = format!("{}-{}", NAMES[tonic], if minor { "minor" } else { "major" });
    Some(Estimate {
        value,
        confidence: (confidence * 100.0).round() / 100.0,
        reasons: vec![format!(
            "its notes fit {} {} best",
            LABELS[tonic],
            if minor { "minor" } else { "major" }
        )],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 44100.0;

    // A kick-like thump on every beat for `bars` bars at `bpm`.
    fn clicks(bpm: f64, bars: usize) -> Vec<f32> {
        let beat = (60.0 / bpm * SR) as usize;
        let len = beat * 4 * bars;
        let mut x = vec![0f32; len];
        for b in 0..4 * bars {
            for i in 0..2000.min(len - b * beat) {
                let t = i as f64 / SR;
                x[b * beat + i] += ((2.0 * std::f64::consts::PI * 60.0 * t).sin() * (-t * 30.0).exp()) as f32;
            }
        }
        x
    }

    // A sustained chord of these MIDI notes.
    fn chord(notes: &[i32], seconds: f64) -> Vec<f32> {
        let n = (seconds * SR) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / SR;
                notes
                    .iter()
                    .map(|&m| (2.0 * std::f64::consts::PI * 440.0 * 2f64.powf((m - 69) as f64 / 12.0) * t).sin())
                    .sum::<f64>() as f32
                    * 0.2
            })
            .collect()
    }

    #[test]
    fn tempo_of_a_loop_snaps_to_whole_bars() {
        for bpm in [90.0, 120.0, 128.0, 140.0, 174.0] {
            let a = analyze_samples(&clicks(bpm, 4), SR, true);
            let est = a.bpm.expect("a tempo");
            let got: f64 = est.value.parse().unwrap();
            // A click on every beat fits half and double time too: then the estimate must say so.
            let octave = [bpm / 2.0, bpm * 2.0].iter().any(|o| (got - o).abs() < 0.6);
            assert!(
                (got - bpm).abs() < 0.6 || (octave && est.reasons.iter().any(|r| r.contains("half or double"))),
                "{bpm}: got {got} {:?}",
                est.reasons
            );
        }
    }

    #[test]
    fn key_of_a_progression() {
        // A minor: Am, F, C, G (A C E, F A C, C E G, G B D).
        let mut x = Vec::new();
        for c in [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] {
            x.extend(chord(&c, 1.5));
        }
        x.extend(chord(&[57, 60, 64], 2.0));
        let k = analyze_samples(&x, SR, true).key.expect("a key");
        assert!(k.value == "a-minor" || k.value == "c-major", "got {}", k.value);
    }

    #[test]
    fn no_tempo_for_a_one_shot_no_key_for_noise() {
        let one = &clicks(120.0, 1)[..20000];
        assert!(analyze_samples(one, SR, true).bpm.is_none());
        let mut seed = 1u32;
        let noise: Vec<f32> = (0..(SR as usize * 4))
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5
            })
            .collect();
        assert!(analyze_samples(&noise, SR, true).key.is_none());
        assert_eq!(analyze_samples(&noise, SR, true).peaks.len(), PEAKS);
    }

    #[test]
    fn a_crafted_header_is_undecodable_never_a_crash() {
        // A 16-bit mono WAV whose fmt chunk says 0 Hz: the decoder panics on it; analysis must answer None.
        let mut w = Vec::new();
        let data = vec![0u8; 4000];
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&((36 + data.len()) as u32).to_le_bytes());
        w.extend_from_slice(b"WAVEfmt ");
        w.extend_from_slice(&16u32.to_le_bytes());
        w.extend_from_slice(&[1, 0, 1, 0]);
        w.extend_from_slice(&0u32.to_le_bytes()); // sample rate
        w.extend_from_slice(&0u32.to_le_bytes()); // byte rate
        w.extend_from_slice(&[2, 0, 16, 0]);
        w.extend_from_slice(b"data");
        w.extend_from_slice(&(data.len() as u32).to_le_bytes());
        w.extend_from_slice(&data);
        assert!(analyze("wav", w, true).is_none());
    }
}
