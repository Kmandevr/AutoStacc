// Storage as an engine Source, for the server Container (native only): ranged GETs of
// <R2_ENDPOINT>/<bucket>/<key>, read in 8 MiB blocks with a small cache so sequential extraction fetches each block
// once. On Cloudflare, R2_ENDPOINT is http://storage.engine, a host the engine Worker answers from its R2 binding: the
// Container holds no storage credentials and has no internet (docs/engine.md). The bucket must be on R2_BUCKETS.
use crate::Source;
use std::io::{self, Read};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

const BLOCK: u64 = 8 << 20;

pub struct R2Config {
    pub endpoint: String,
    pub buckets: Vec<String>,
}

impl R2Config {
    /// From the environment; None when R2 access isn't configured (local development uses files instead).
    pub fn from_env() -> Option<Self> {
        let get = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
        Some(Self {
            endpoint: get("R2_ENDPOINT")?.trim_end_matches('/').to_string(),
            buckets: get("R2_BUCKETS")?
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
        })
    }
}

pub struct R2Source {
    url: String,
    len: u64,
    agent: ureq::Agent,
    cache: Mutex<Vec<(u64, Vec<u8>)>>,
    pub bytes_fetched: AtomicU64,
}

fn err(e: impl std::fmt::Display) -> io::Error {
    io::Error::other(e.to_string())
}

impl R2Source {
    pub fn open(cfg: &R2Config, bucket: &str, key: &str) -> io::Result<Self> {
        if !cfg.buckets.iter().any(|b| b == bucket) {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "bucket not allowed"));
        }
        let url = format!("{}/{}/{}", cfg.endpoint, bucket, encode_key(key));
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(10))
            .timeout_read(Duration::from_secs(60))
            .build();
        let resp = agent.head(&url).call().map_err(|e| match e {
            ureq::Error::Status(404, _) => io::Error::new(io::ErrorKind::NotFound, "no such object"),
            e => err(e),
        })?;
        let len = ["x-object-size", "content-length"]
            .iter()
            .find_map(|h| resp.header(h).and_then(|v| v.parse().ok()))
            .ok_or_else(|| err("no length"))?;
        Ok(Self {
            url,
            len,
            agent,
            cache: Mutex::new(Vec::new()),
            bytes_fetched: AtomicU64::new(0),
        })
    }

    fn block(&self, index: u64) -> io::Result<Vec<u8>> {
        let start = index * BLOCK;
        let end = (start + BLOCK).min(self.len) - 1;
        let resp = self
            .agent
            .get(&self.url)
            .set("Range", &format!("bytes={start}-{end}"))
            .call()
            .map_err(err)?;
        let mut data = Vec::with_capacity((end - start + 1) as usize);
        resp.into_reader().take(end - start + 1).read_to_end(&mut data)?;
        if data.len() as u64 != end - start + 1 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "short range read"));
        }
        self.bytes_fetched.fetch_add(data.len() as u64, Ordering::Relaxed);
        Ok(data)
    }
}

/// Percent-encodes a key for a URL path, keeping its slashes.
fn encode_key(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    for b in key.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~/".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

impl Source for R2Source {
    fn len(&self) -> u64 {
        self.len
    }

    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        if offset >= self.len || buf.is_empty() {
            return Ok(0);
        }
        let index = offset / BLOCK;
        let mut cache = self.cache.lock().unwrap();
        if !cache.iter().any(|(i, _)| *i == index) {
            let data = self.block(index)?;
            if cache.len() >= 2 {
                cache.remove(0);
            }
            cache.push((index, data));
        }
        let (_, data) = cache.iter().find(|(i, _)| *i == index).unwrap();
        let at = (offset - index * BLOCK) as usize;
        let n = buf.len().min(data.len() - at);
        buf[..n].copy_from_slice(&data[at..at + n]);
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn keys_keep_slashes_and_escape_the_rest() {
        assert_eq!(
            super::encode_key("incoming/v 1/Kick #1.wav"),
            "incoming/v%201/Kick%20%231.wav"
        );
    }
}
