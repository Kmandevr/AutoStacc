// What a file really is, from its bytes: magic numbers and structure first, the file extension only as a hint.
// Identification is separate from classification (what the asset is for, decided later from facts and context).
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Identity {
    /// Canonical format slug (wav, aiff, flac, mp3, ogg, midi, zip, …) or "unknown".
    pub format: String,
    /// "signature" when the bytes prove it, "extension" when only the name says so (formats with no signature).
    pub by: &'static str,
    /// The extension says one thing and the bytes another (a deceptive or misnamed file).
    pub mismatch: bool,
}

pub fn extension(name: &str) -> String {
    let base = name.rsplit('/').next().unwrap_or(name);
    match base.rfind('.') {
        Some(i) if i > 0 && base.len() - i <= 13 => base[i + 1..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn at(b: &[u8], off: usize, s: &[u8]) -> bool {
    b.len() >= off + s.len() && &b[off..off + s.len()] == s
}

/// Format proven by the first bytes (at least 16, ideally a few KB), if any.
pub fn sniff(b: &[u8]) -> Option<&'static str> {
    if (at(b, 0, b"RIFF") || at(b, 0, b"RF64") || at(b, 0, b"BW64")) && at(b, 8, b"WAVE") {
        return Some("wav");
    }
    if at(b, 0, b"RIFF") && at(b, 8, b"WEBP") {
        return Some("webp");
    }
    if at(b, 0, b"FORM") && (at(b, 8, b"AIFF") || at(b, 8, b"AIFC")) {
        return Some("aiff");
    }
    if at(b, 0, b"fLaC") {
        return Some("flac");
    }
    if at(b, 0, b"OggS") {
        return Some("ogg");
    }
    if at(b, 0, b"MThd") {
        return Some("midi");
    }
    if at(b, 0, b"PK\x03\x04") || at(b, 0, b"PK\x05\x06") {
        return Some("zip");
    }
    if at(b, 0, b"%PDF-") {
        return Some("pdf");
    }
    if at(b, 0, b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if at(b, 0, b"\xff\xd8\xff") {
        return Some("jpg");
    }
    if at(b, 0, b"GIF87a") || at(b, 0, b"GIF89a") {
        return Some("gif");
    }
    if at(b, 4, b"ftyp") {
        return Some("mp4");
    }
    if at(b, 0, b"\x1a\x45\xdf\xa3") {
        return Some("webm");
    }
    if at(b, 0, b"CcnK") {
        return Some("fxp");
    }
    if at(b, 0, b"FLhd") {
        return Some("flp");
    }
    if at(b, 0, b"<REAPER_PROJECT") {
        return Some("rpp");
    }
    if at(b, 0, b"ID3") || (b.len() >= 2 && b[0] == 0xff && (b[1] & 0xe0) == 0xe0 && (b[1] & 0x06) != 0) {
        return Some("mp3");
    }
    None
}

/// Extension → canonical format for files whose bytes don't prove anything by themselves. Slugs and extensions match
/// FORMATS in server/discovery/vocabulary.js (test/unit/asset-vocabulary.test.js checks it).
fn by_extension(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "wav" | "wave" => "wav",
        "aif" | "aiff" | "aifc" => "aiff",
        "flac" => "flac",
        "mp3" => "mp3",
        "ogg" | "oga" => "ogg",
        "mid" | "midi" => "midi",
        "zip" => "zip",
        "pdf" => "pdf",
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        "gif" => "gif",
        "webp" => "webp",
        "mp4" | "m4a" | "mov" => "mp4",
        "webm" => "webm",
        "fxp" | "fxb" => "fxp",
        "flp" => "flp",
        "rpp" => "rpp",
        "als" => "als",
        "alp" => "alp",
        "adg" => "adg",
        "adv" => "adv",
        "vital" | "vitalbank" | "vitalpreset" => "vital",
        "serumpreset" | "serumpack" => "serum",
        "h2p" => "h2p",
        "nmsv" => "nmsv",
        "sfz" => "sfz",
        "sf2" => "sf2",
        "exs" => "exs",
        "nki" | "nkm" | "nkx" | "nkc" | "ncw" => "kontakt",
        "logicx" => "logicx",
        "ptx" => "ptx",
        "cpr" => "cpr",
        "song" => "song",
        "bwproject" => "bitwig-project",
        "bwpreset" => "bitwig-preset",
        "bwclip" => "bitwig-clip",
        "txt" | "md" => "text",
        _ => return None,
    })
}

/// Formats an extension promises a signature for: if the bytes don't show it, the name is lying.
fn has_signature(format: &str) -> bool {
    matches!(
        format,
        "wav"
            | "aiff"
            | "flac"
            | "ogg"
            | "midi"
            | "zip"
            | "pdf"
            | "png"
            | "jpg"
            | "gif"
            | "webp"
            | "mp4"
            | "webm"
            | "mp3"
            | "fxp"
            | "flp"
    )
}

pub fn identify(name: &str, head: &[u8]) -> Identity {
    let ext = extension(name);
    let claimed = by_extension(&ext);
    match (sniff(head), claimed) {
        (Some(real), Some(c)) => Identity {
            format: real.into(),
            by: "signature",
            mismatch: real != c,
        },
        (Some(real), None) => Identity {
            format: real.into(),
            by: "signature",
            mismatch: false,
        },
        (None, Some(c)) if has_signature(c) => Identity {
            format: "unknown".into(),
            by: "extension",
            mismatch: true,
        },
        (None, Some(c)) => Identity {
            format: c.into(),
            by: "extension",
            mismatch: false,
        },
        (None, None) => Identity {
            format: "unknown".into(),
            by: "extension",
            mismatch: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_beats_extension() {
        let wav = b"RIFF\x24\0\0\0WAVEfmt ";
        assert_eq!(
            identify("Kick.wav", wav),
            Identity {
                format: "wav".into(),
                by: "signature",
                mismatch: false
            }
        );
        assert!(identify("Kick.mp3", wav).mismatch);
        assert_eq!(identify("Loop.WAV", b"not audio at all").format, "unknown");
        assert!(identify("Loop.WAV", b"not audio at all").mismatch);
    }

    #[test]
    fn formats_without_signature_go_by_extension() {
        let id = identify("Bass/Wobble.vital", b"{\"preset_name\":1}");
        assert_eq!((id.format.as_str(), id.by, id.mismatch), ("vital", "extension", false));
        assert_eq!(identify("x.unknownext", b"\0\0\0\0").format, "unknown");
    }

    #[test]
    fn extensions() {
        assert_eq!(extension("a/b/Kick 01.WAV"), "wav");
        assert_eq!(extension(".hidden"), "");
        assert_eq!(extension("noext"), "");
    }
}
