// Reading creators' ZIP archives safely, without ever loading them whole: the central directory is read from the end,
// every entry is checked before anything is extracted (paths, symlinks, encryption, sizes, overlaps, compression
// ratio), and extraction streams through a bounded buffer that stops the moment output exceeds the declared size.
// Nothing in an archive is ever executed; names never become storage keys (the caller picks random keys).
use crate::hash::{Digests, Hasher};
use crate::Source;
use flate2::{Decompress, FlushDecompress, Status};
use serde::Serialize;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone)]
pub struct Limits {
    pub max_entries: usize,
    pub max_total_bytes: u64,
    pub max_entry_bytes: u64,
    pub max_ratio: u64,
    pub max_depth: usize,
    pub max_path_bytes: usize,
    pub max_central_dir_bytes: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_entries: 10_000,
            max_total_bytes: 50 << 30,
            max_entry_bytes: 20 << 30,
            max_ratio: 200,
            max_depth: 32,
            max_path_bytes: 1024,
            max_central_dir_bytes: 64 << 20,
        }
    }
}

/// Something wrong with one entry. `refused` entries are never extracted; the rest are warnings for the review screen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Issue {
    pub code: &'static str,
    pub refused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub index: usize,
    /// Normalized path (NFC, forward slashes, no `.`/`..`), or the raw name when it couldn't be normalized.
    pub path: String,
    pub is_dir: bool,
    /// System files (`__MACOSX/`, `.DS_Store`, `Thumbs.db`, `._*`) that are skipped, not imported.
    pub ignored: bool,
    pub method: u16,
    pub crc32: u32,
    pub compressed_size: u64,
    pub size: u64,
    #[serde(skip)]
    pub local_header_offset: u64,
    #[serde(skip)]
    pub data_offset: u64,
    pub issues: Vec<Issue>,
}

impl Entry {
    pub fn refused(&self) -> bool {
        self.issues.iter().any(|i| i.refused)
    }
    /// A regular file to import: not a folder, not ignored, not refused.
    pub fn importable(&self) -> bool {
        !self.is_dir && !self.ignored && !self.refused()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Archive {
    pub entries: Vec<Entry>,
    pub total_size: u64,
    pub zip64: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ZipError {
    NotZip,
    Truncated,
    TooManyEntries,
    CentralDirTooLarge,
    TooLarge,
    Io(String),
    /// Extraction: output bigger than the header said (a bomb), or a damaged stream.
    SizeMismatch,
    CrcMismatch,
    Corrupt,
    Unsupported,
}

impl ZipError {
    pub fn code(&self) -> &'static str {
        match self {
            ZipError::NotZip => "not_zip",
            ZipError::Truncated => "truncated",
            ZipError::TooManyEntries => "too_many_entries",
            ZipError::CentralDirTooLarge => "central_directory_too_large",
            ZipError::TooLarge => "too_large",
            ZipError::Io(_) => "io",
            ZipError::SizeMismatch => "size_mismatch",
            ZipError::CrcMismatch => "crc_mismatch",
            ZipError::Corrupt => "corrupt",
            ZipError::Unsupported => "unsupported",
        }
    }
}

impl From<std::io::Error> for ZipError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            ZipError::Truncated
        } else {
            ZipError::Io(e.to_string())
        }
    }
}

fn u16le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}
fn u32le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}
fn u64le(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}

const EOCD: u32 = 0x0605_4b50;
const EOCD64: u32 = 0x0606_4b50;
const EOCD64_LOC: u32 = 0x0706_4b50;
const CDH: u32 = 0x0201_4b50;
const LFH: u32 = 0x0403_4b50;

// Code page 437, bytes 0x80-0xFF: what names in ZIPs made without the UTF-8 flag (older Windows tools) mean.
const CP437_HIGH: &str = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{a0}";

fn cp437(bytes: &[u8]) -> String {
    let high: Vec<char> = CP437_HIGH.chars().collect();
    bytes
        .iter()
        .map(|&b| if b < 0x80 { b as char } else { high[(b - 0x80) as usize] })
        .collect()
}

const WINDOWS_RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Normalizes an archive path, or says why it is unsafe.
pub fn normalize_path(raw: &str, limits: &Limits) -> Result<String, &'static str> {
    if raw.chars().any(|c| c == '\0' || (c as u32) < 0x20 || c == '\u{7f}') {
        return Err("control_characters");
    }
    let s = raw.replace('\\', "/");
    if s.starts_with('/') || s.as_bytes().get(1) == Some(&b':') {
        return Err("absolute_path");
    }
    let mut parts = Vec::new();
    for seg in s.split('/') {
        match seg {
            "" | "." => continue,
            ".." => return Err("path_traversal"),
            _ => {
                let stem = seg.split('.').next().unwrap_or("").to_ascii_lowercase();
                if WINDOWS_RESERVED.contains(&stem.as_str()) {
                    return Err("reserved_name");
                }
                parts.push(seg.nfc().collect::<String>());
            }
        }
    }
    if parts.is_empty() {
        return Err("empty_path");
    }
    if parts.len() > limits.max_depth {
        return Err("too_deep");
    }
    let joined = parts.join("/");
    if joined.len() > limits.max_path_bytes {
        return Err("path_too_long");
    }
    Ok(joined)
}

fn is_system_file(path: &str) -> bool {
    let base = path.rsplit('/').next().unwrap_or(path);
    path.starts_with("__MACOSX/")
        || base == ".DS_Store"
        || base == "Thumbs.db"
        || base == "desktop.ini"
        || base.starts_with("._")
}

fn find_eocd(src: &dyn Source) -> Result<(u64, Vec<u8>), ZipError> {
    let len = src.len();
    if len < 22 {
        return Err(ZipError::NotZip);
    }
    let tail_len = len.min(22 + 65_535);
    let mut tail = vec![0u8; tail_len as usize];
    src.read_exact_at(len - tail_len, &mut tail)?;
    for i in (0..=tail.len() - 22).rev() {
        if u32le(&tail, i) == EOCD {
            let comment = u16le(&tail, i + 20) as usize;
            if i + 22 + comment <= tail.len() {
                return Ok((len - tail_len + i as u64, tail[i..i + 22].to_vec()));
            }
        }
    }
    Err(ZipError::NotZip)
}

/// Lists and checks every entry. Errors here mean the archive as a whole can't be used.
pub fn list(src: &dyn Source, limits: &Limits) -> Result<Archive, ZipError> {
    let (eocd_at, eocd) = find_eocd(src)?;
    let mut count = u16le(&eocd, 10) as u64;
    let mut cd_size = u32le(&eocd, 12) as u64;
    let mut cd_off = u32le(&eocd, 16) as u64;
    let mut zip64 = false;
    if eocd_at >= 20 && (count == 0xffff || cd_size == 0xffff_ffff || cd_off == 0xffff_ffff) {
        let mut loc = [0u8; 20];
        src.read_exact_at(eocd_at - 20, &mut loc)?;
        if u32le(&loc, 0) == EOCD64_LOC {
            let at = u64le(&loc, 8);
            let mut rec = [0u8; 56];
            src.read_exact_at(at, &mut rec)?;
            if u32le(&rec, 0) != EOCD64 {
                return Err(ZipError::Truncated);
            }
            count = u64le(&rec, 32);
            cd_size = u64le(&rec, 40);
            cd_off = u64le(&rec, 48);
            zip64 = true;
        }
    }
    if count as usize > limits.max_entries {
        return Err(ZipError::TooManyEntries);
    }
    if cd_size > limits.max_central_dir_bytes {
        return Err(ZipError::CentralDirTooLarge);
    }
    if cd_off.checked_add(cd_size).is_none_or(|end| end > src.len()) {
        return Err(ZipError::Truncated);
    }
    let mut cd = vec![0u8; cd_size as usize];
    src.read_exact_at(cd_off, &mut cd)?;

    let mut entries = Vec::with_capacity(count as usize);
    let mut p = 0usize;
    let mut total: u64 = 0;
    for index in 0..count as usize {
        if p + 46 > cd.len() || u32le(&cd, p) != CDH {
            return Err(ZipError::Truncated);
        }
        let made_by = u16le(&cd, p + 4);
        let flags = u16le(&cd, p + 8);
        let method = u16le(&cd, p + 10);
        let crc = u32le(&cd, p + 16);
        let mut csize = u32le(&cd, p + 20) as u64;
        let mut size = u32le(&cd, p + 24) as u64;
        let (nlen, xlen, clen) = (
            u16le(&cd, p + 28) as usize,
            u16le(&cd, p + 30) as usize,
            u16le(&cd, p + 32) as usize,
        );
        let ext_attr = u32le(&cd, p + 38);
        let mut lho = u32le(&cd, p + 42) as u64;
        let end = p + 46 + nlen + xlen + clen;
        if end > cd.len() {
            return Err(ZipError::Truncated);
        }
        let name_bytes = &cd[p + 46..p + 46 + nlen];
        let extra = &cd[p + 46 + nlen..p + 46 + nlen + xlen];
        let mut name = if flags & 0x800 != 0 {
            String::from_utf8_lossy(name_bytes).into_owned()
        } else {
            cp437(name_bytes)
        };
        // Extra fields: ZIP64 sizes/offset, and Info-ZIP's Unicode path (used only if it matches the stored name).
        let mut q = 0usize;
        while q + 4 <= extra.len() {
            let (id, sz) = (u16le(extra, q), u16le(extra, q + 2) as usize);
            let body = &extra[q + 4..(q + 4 + sz).min(extra.len())];
            if id == 0x0001 {
                let mut r = 0usize;
                let mut take = |v: &mut u64| {
                    if *v == 0xffff_ffff && r + 8 <= body.len() {
                        *v = u64le(body, r);
                        r += 8;
                    }
                };
                take(&mut size);
                take(&mut csize);
                take(&mut lho);
                zip64 = true;
            } else if id == 0x7075 && body.len() > 5 && body[0] == 1 && u32le(body, 1) == crc32fast::hash(name_bytes) {
                if let Ok(u) = std::str::from_utf8(&body[5..]) {
                    name = u.to_owned();
                }
            }
            q += 4 + sz;
        }
        p = end;

        let is_dir = name.ends_with('/') || name.ends_with('\\');
        let mut issues = Vec::new();
        let path = match normalize_path(&name, limits) {
            Ok(n) => n,
            Err(code) => {
                issues.push(Issue { code, refused: true });
                name.clone()
            }
        };
        let host = made_by >> 8;
        if host == 3 && (ext_attr >> 16) & 0o170000 == 0o120000 {
            issues.push(Issue {
                code: "symlink",
                refused: true,
            });
        }
        if flags & 1 != 0 {
            issues.push(Issue {
                code: "encrypted",
                refused: true,
            });
        }
        if !is_dir && method != 0 && method != 8 {
            issues.push(Issue {
                code: "unsupported_compression",
                refused: true,
            });
        }
        if size > limits.max_entry_bytes {
            issues.push(Issue {
                code: "file_too_large",
                refused: true,
            });
        }
        if size > (1 << 20) && size / csize.max(1) > limits.max_ratio {
            issues.push(Issue {
                code: "suspicious_compression_ratio",
                refused: true,
            });
        }
        let ignored = !is_dir && is_system_file(&path);
        if !is_dir && !ignored && !issues.iter().any(|i| i.refused) {
            total = total.saturating_add(size);
        }
        entries.push(Entry {
            index,
            path,
            is_dir,
            ignored,
            method,
            crc32: crc,
            compressed_size: csize,
            size,
            local_header_offset: lho,
            data_offset: 0,
            issues,
        });
    }
    if total > limits.max_total_bytes {
        return Err(ZipError::TooLarge);
    }

    // Local headers: where each file's data starts. Data ranges must sit before the central directory and must not
    // overlap (overlapping entries are how some ZIP bombs multiply a small archive into terabytes).
    let mut ranges: Vec<(u64, u64, usize)> = Vec::new();
    for e in entries.iter_mut().filter(|e| !e.is_dir) {
        let mut h = [0u8; 30];
        if src.read_exact_at(e.local_header_offset, &mut h).is_err() || u32le(&h, 0) != LFH {
            e.issues.push(Issue {
                code: "damaged_entry",
                refused: true,
            });
            continue;
        }
        e.data_offset = e.local_header_offset + 30 + u16le(&h, 26) as u64 + u16le(&h, 28) as u64;
        let end = e.data_offset.saturating_add(e.compressed_size);
        if end > cd_off {
            e.issues.push(Issue {
                code: "damaged_entry",
                refused: true,
            });
            continue;
        }
        ranges.push((e.local_header_offset, end, e.index));
    }
    ranges.sort();
    for w in ranges.windows(2) {
        if w[1].0 < w[0].1 {
            entries[w[1].2].issues.push(Issue {
                code: "overlapping_entries",
                refused: true,
            });
        }
    }

    // Two entries that would land on the same file on a case-insensitive disk (Windows, macOS).
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for i in 0..entries.len() {
        if entries[i].refused() || entries[i].ignored {
            continue;
        }
        let key = entries[i].path.to_lowercase();
        if let Some(&first) = seen.get(&key) {
            let code = if entries[first].path == entries[i].path {
                "duplicate_name"
            } else {
                "case_collision"
            };
            entries[i].issues.push(Issue { code, refused: false });
        } else {
            seen.insert(key, i);
        }
    }
    Ok(Archive {
        entries,
        total_size: total,
        zip64,
    })
}

/// Streams one entry's original bytes, checking size and CRC-32 as it goes and computing SHA-256.
pub struct EntryReader<'a> {
    src: &'a dyn Source,
    pos: u64,
    left_in: u64,
    expected: u64,
    expected_crc: u32,
    produced: u64,
    state: Option<Decompress>,
    inbuf: Vec<u8>,
    in_start: usize,
    in_end: usize,
    hasher: Option<Hasher>,
    finished: bool,
    digests: Option<Digests>,
}

const IN_CHUNK: usize = 256 << 10;

impl<'a> EntryReader<'a> {
    pub fn open(src: &'a dyn Source, e: &Entry) -> Result<Self, ZipError> {
        if !e.importable() {
            return Err(ZipError::Unsupported);
        }
        let state = if e.method == 8 {
            Some(Decompress::new(false))
        } else {
            None
        };
        Ok(Self {
            src,
            pos: e.data_offset,
            left_in: e.compressed_size,
            expected: e.size,
            expected_crc: e.crc32,
            produced: 0,
            state,
            inbuf: vec![0; IN_CHUNK],
            in_start: 0,
            in_end: 0,
            hasher: Some(Hasher::new()),
            finished: false,
            digests: None,
        })
    }

    fn fill(&mut self) -> Result<(), ZipError> {
        if self.in_start == self.in_end && self.left_in > 0 {
            let want = (self.left_in as usize).min(IN_CHUNK);
            self.src.read_exact_at(self.pos, &mut self.inbuf[..want])?;
            self.pos += want as u64;
            self.left_in -= want as u64;
            self.in_start = 0;
            self.in_end = want;
        }
        Ok(())
    }

    fn finish(&mut self) -> Result<(), ZipError> {
        self.finished = true;
        if self.produced != self.expected {
            return Err(ZipError::SizeMismatch);
        }
        let d = self.hasher.take().unwrap().finish();
        if d.crc32 != self.expected_crc {
            return Err(ZipError::CrcMismatch);
        }
        self.digests = Some(d);
        Ok(())
    }

    /// Next piece of the original file into `out`; 0 means the end (after which `digests()` is available).
    pub fn read(&mut self, out: &mut [u8]) -> Result<usize, ZipError> {
        if self.finished {
            return Ok(0);
        }
        loop {
            self.fill()?;
            let (consumed, written, ended) = match self.state.as_mut() {
                None => {
                    let n = (self.in_end - self.in_start).min(out.len());
                    out[..n].copy_from_slice(&self.inbuf[self.in_start..self.in_start + n]);
                    (n, n, self.left_in == 0 && self.in_start + n == self.in_end)
                }
                Some(state) => {
                    let (before_in, before_out) = (state.total_in(), state.total_out());
                    let r = state.decompress(&self.inbuf[self.in_start..self.in_end], out, FlushDecompress::None);
                    let consumed = (state.total_in() - before_in) as usize;
                    let written = (state.total_out() - before_out) as usize;
                    match r {
                        Ok(Status::StreamEnd) => (consumed, written, true),
                        Ok(_) => (consumed, written, false),
                        Err(_) => return Err(ZipError::Corrupt),
                    }
                }
            };
            self.in_start += consumed;
            self.produced += written as u64;
            if self.produced > self.expected {
                self.finished = true;
                return Err(ZipError::SizeMismatch);
            }
            self.hasher.as_mut().unwrap().update(&out[..written]);
            if ended {
                self.finish()?;
                return Ok(written);
            }
            if written > 0 {
                return Ok(written);
            }
            if consumed == 0 && self.left_in == 0 && self.in_start == self.in_end {
                return Err(ZipError::Truncated);
            }
        }
    }

    pub fn digests(&self) -> Option<&Digests> {
        self.digests.as_ref()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub struct TestEntry<'a> {
        pub name: &'a [u8],
        pub data: &'a [u8],
        pub deflate: bool,
        pub utf8: bool,
        pub flags: u16,
        pub unix_mode: Option<u32>,
    }

    impl<'a> TestEntry<'a> {
        pub fn file(name: &'a str, data: &'a [u8]) -> Self {
            Self {
                name: name.as_bytes(),
                data,
                deflate: true,
                utf8: true,
                flags: 0,
                unix_mode: None,
            }
        }
    }

    /// Builds a small ZIP (stored or deflated) for tests; `patch` can tamper with the result.
    pub fn build_zip(entries: &[TestEntry]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut cd = Vec::new();
        for e in entries {
            let crc = crc32fast::hash(e.data);
            let body = if e.deflate {
                miniz_oxide::deflate::compress_to_vec(e.data, 6)
            } else {
                e.data.to_vec()
            };
            let method: u16 = if e.deflate { 8 } else { 0 };
            let flags = e.flags | if e.utf8 { 0x800 } else { 0 };
            let lho = out.len() as u32;
            out.extend_from_slice(&LFH.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&flags.to_le_bytes());
            out.extend_from_slice(&method.to_le_bytes());
            out.extend_from_slice(&[0; 4]);
            out.extend_from_slice(&crc.to_le_bytes());
            out.extend_from_slice(&(body.len() as u32).to_le_bytes());
            out.extend_from_slice(&(e.data.len() as u32).to_le_bytes());
            out.extend_from_slice(&(e.name.len() as u16).to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(e.name);
            out.extend_from_slice(&body);
            cd.extend_from_slice(&CDH.to_le_bytes());
            let made_by: u16 = if e.unix_mode.is_some() { 0x0314 } else { 20 };
            cd.extend_from_slice(&made_by.to_le_bytes());
            cd.extend_from_slice(&20u16.to_le_bytes());
            cd.extend_from_slice(&flags.to_le_bytes());
            cd.extend_from_slice(&method.to_le_bytes());
            cd.extend_from_slice(&[0; 4]);
            cd.extend_from_slice(&crc.to_le_bytes());
            cd.extend_from_slice(&(body.len() as u32).to_le_bytes());
            cd.extend_from_slice(&(e.data.len() as u32).to_le_bytes());
            cd.extend_from_slice(&(e.name.len() as u16).to_le_bytes());
            cd.extend_from_slice(&[0; 8]);
            cd.extend_from_slice(&(e.unix_mode.unwrap_or(0) << 16).to_le_bytes());
            cd.extend_from_slice(&lho.to_le_bytes());
            cd.extend_from_slice(e.name);
        }
        let cd_off = out.len() as u32;
        out.extend_from_slice(&cd);
        out.extend_from_slice(&EOCD.to_le_bytes());
        out.extend_from_slice(&[0; 4]);
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(cd.len() as u32).to_le_bytes());
        out.extend_from_slice(&cd_off.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out
    }

    #[allow(clippy::ptr_arg)]
    fn extract(src: &Vec<u8>, e: &Entry) -> Result<(Vec<u8>, Digests), ZipError> {
        let mut r = EntryReader::open(src, e)?;
        let mut all = Vec::new();
        let mut buf = vec![0u8; 4096];
        loop {
            let n = r.read(&mut buf)?;
            if n == 0 {
                break;
            }
            all.extend_from_slice(&buf[..n]);
        }
        Ok((all, r.digests().cloned().unwrap()))
    }

    #[test]
    fn lists_and_extracts_byte_for_byte() {
        let big: Vec<u8> = (0..300_000u32)
            .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
            .collect();
        let zip = build_zip(&[
            TestEntry::file("Drums/Kicks/Kick 01.wav", &big),
            TestEntry {
                deflate: false,
                ..TestEntry::file("Docs/readme.txt", b"hello")
            },
            TestEntry::file("Drums/", b""),
        ]);
        let a = list(&zip, &Limits::default()).unwrap();
        assert_eq!(a.entries.len(), 3);
        assert!(a.entries[2].is_dir);
        for (e, want) in a.entries.iter().take(2).zip([&big[..], b"hello"]) {
            assert!(e.importable(), "{:?}", e.issues);
            let (bytes, d) = extract(&zip, e).unwrap();
            assert_eq!(bytes, want);
            assert_eq!(d.crc32, e.crc32);
            assert_eq!(d.sha256, crate::hash::digest_source(&want.to_vec()).unwrap().sha256);
        }
    }

    #[test]
    fn unsafe_paths_are_refused() {
        let l = Limits::default();
        for (raw, code) in [
            ("../evil.wav", "path_traversal"),
            ("a/../../x", "path_traversal"),
            ("/etc/passwd", "absolute_path"),
            ("C:\\x.wav", "absolute_path"),
            ("a\u{1}b", "control_characters"),
            ("Drums/CON.wav", "reserved_name"),
        ] {
            assert_eq!(normalize_path(raw, &l), Err(code), "{raw}");
        }
        assert_eq!(
            normalize_path("Drums\\Kicks\\.\\Kick.wav", &l).unwrap(),
            "Drums/Kicks/Kick.wav"
        );
        assert_eq!(normalize_path("Cafe\u{301}.wav", &l).unwrap(), "Caf\u{e9}.wav");
        let deep = vec!["d"; 40].join("/");
        assert_eq!(normalize_path(&deep, &l), Err("too_deep"));

        let zip = build_zip(&[TestEntry::file("../../evil.wav", b"x")]);
        let e = &list(&zip, &l).unwrap().entries[0];
        assert!(e.refused());
        assert!(EntryReader::open(&zip, e).is_err());
    }

    #[test]
    fn symlinks_encryption_and_system_files() {
        let zip = build_zip(&[
            TestEntry {
                unix_mode: Some(0o120777),
                ..TestEntry::file("link", b"/etc/passwd")
            },
            TestEntry {
                flags: 1,
                ..TestEntry::file("secret.wav", b"x")
            },
            TestEntry::file("__MACOSX/._Kick.wav", b"x"),
            TestEntry::file("Drums/.DS_Store", b"x"),
        ]);
        let a = list(&zip, &Limits::default()).unwrap();
        assert_eq!(a.entries[0].issues[0].code, "symlink");
        assert_eq!(a.entries[1].issues[0].code, "encrypted");
        assert!(a.entries[2].ignored && a.entries[3].ignored);
        assert_eq!(a.total_size, 0);
    }

    #[test]
    fn cp437_names_and_case_collisions() {
        let z = build_zip(&[TestEntry {
            name: b"Caf\x82.wav",
            utf8: false,
            ..TestEntry::file("", b"a")
        }]);
        assert_eq!(list(&z, &Limits::default()).unwrap().entries[0].path, "Caf\u{e9}.wav");
        let zip = build_zip(&[
            TestEntry::file("Loops/Kick.wav", b"a"),
            TestEntry::file("loops/kick.WAV", b"b"),
        ]);
        let a = list(&zip, &Limits::default()).unwrap();
        assert!(a.entries[0].issues.is_empty());
        assert_eq!(
            a.entries[1].issues,
            vec![Issue {
                code: "case_collision",
                refused: false
            }]
        );
    }

    #[test]
    fn lying_sizes_and_bad_crcs_stop_extraction() {
        let data = vec![7u8; 2_000_000];
        // Header claims a small size: output past it is refused at once (decompression bomb).
        let mut zip = build_zip(&[TestEntry::file("bomb.wav", &data)]);
        let cd_at = zip.len() - 22 - (46 + 8);
        zip[cd_at + 24..cd_at + 28].copy_from_slice(&1000u32.to_le_bytes());
        let a = list(&zip, &Limits::default()).unwrap();
        assert_eq!(extract(&zip, &a.entries[0]).unwrap_err(), ZipError::SizeMismatch);

        let mut zip = build_zip(&[TestEntry {
            deflate: false,
            ..TestEntry::file("x.wav", b"original bytes")
        }]);
        let cd_at = zip.len() - 22 - (46 + 5);
        zip[cd_at + 16] ^= 0xff;
        let a = list(&zip, &Limits::default()).unwrap();
        assert_eq!(extract(&zip, &a.entries[0]).unwrap_err(), ZipError::CrcMismatch);
    }

    #[test]
    fn high_ratio_and_overlapping_entries_are_refused() {
        let zeros = vec![0u8; 50 << 20];
        let zip = build_zip(&[TestEntry::file("zeros.wav", &zeros)]);
        let a = list(&zip, &Limits::default()).unwrap();
        assert_eq!(a.entries[0].issues[0].code, "suspicious_compression_ratio");

        // Second central-directory record pointing at the first entry's data.
        let mut zip = build_zip(&[TestEntry::file("a.wav", b"aaaa"), TestEntry::file("b.wav", b"bbbb")]);
        let first_cd = zip.len() - 22 - 2 * (46 + 5);
        let second_cd = first_cd + 46 + 5;
        let lho_first = zip[first_cd + 42..first_cd + 46].to_vec();
        zip[second_cd + 42..second_cd + 46].copy_from_slice(&lho_first);
        let a = list(&zip, &Limits::default()).unwrap();
        assert!(a
            .entries
            .iter()
            .any(|e| e.issues.iter().any(|i| i.code == "overlapping_entries")));
    }

    #[test]
    fn archive_level_errors() {
        assert_eq!(
            list(&b"not a zip at all, just text....".to_vec(), &Limits::default()).unwrap_err(),
            ZipError::NotZip
        );
        let zip = build_zip(&[TestEntry::file("a", b"a"), TestEntry::file("b", b"b")]);
        let l = Limits {
            max_entries: 1,
            ..Limits::default()
        };
        assert_eq!(list(&zip, &l).unwrap_err(), ZipError::TooManyEntries);
        let cut = zip[..zip.len() - 30].to_vec();
        assert!(list(&cut, &Limits::default()).is_err());
    }
}
