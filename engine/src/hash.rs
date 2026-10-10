// Integrity hashes for originals: SHA-256 (identity of the bytes, compared end to end) and CRC-32 (needed by ZIP
// headers). Both are fed incrementally so files of any size stream through in fixed-size chunks.
use sha2::{Digest, Sha256};

#[derive(Default)]
pub struct Hasher {
    sha: Sha256,
    crc: crc32fast::Hasher,
    len: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Digests {
    pub sha256: String,
    pub crc32: u32,
    pub len: u64,
}

impl Hasher {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update(&mut self, bytes: &[u8]) {
        self.sha.update(bytes);
        self.crc.update(bytes);
        self.len += bytes.len() as u64;
    }

    pub fn finish(self) -> Digests {
        Digests {
            sha256: hex(&self.sha.finalize()),
            crc32: self.crc.finalize(),
            len: self.len,
        }
    }
}

pub fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}

/// Hashes a whole source in 1 MiB chunks.
pub fn digest_source(src: &dyn crate::Source) -> std::io::Result<Digests> {
    let mut h = Hasher::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut off = 0u64;
    loop {
        let n = src.read_at(off, &mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        off += n as u64;
    }
    Ok(h.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vectors() {
        let mut h = Hasher::new();
        h.update(b"abc");
        let d = h.finish();
        assert_eq!(
            d.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(d.crc32, 0x352441c2);
        assert_eq!(d.len, 3);
    }

    #[test]
    fn chunking_does_not_change_the_result() {
        let data: Vec<u8> = (0..100_000u32).map(|i| (i * 7 % 251) as u8).collect();
        let whole = {
            let mut h = Hasher::new();
            h.update(&data);
            h.finish()
        };
        let parts = {
            let mut h = Hasher::new();
            for c in data.chunks(997) {
                h.update(c);
            }
            h.finish()
        };
        assert_eq!(whole, parts);
        assert_eq!(digest_source(&data).unwrap(), whole);
    }
}
