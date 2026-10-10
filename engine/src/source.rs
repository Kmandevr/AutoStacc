// Random-access byte sources. The engine never opens files or sockets itself: the native binary gives it a file,
// the WebAssembly build a host callback (a Blob in the browser, a file in Node tests), the tests a byte vector.
use std::io;

pub trait Source {
    /// Total length in bytes.
    fn len(&self) -> u64;
    /// Fills as much of `buf` as possible from `offset`; returns the number of bytes read (0 at the end).
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize>;

    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Reads exactly `buf.len()` bytes or fails.
    fn read_exact_at(&self, mut offset: u64, mut buf: &mut [u8]) -> io::Result<()> {
        while !buf.is_empty() {
            let n = self.read_at(offset, buf)?;
            if n == 0 {
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "unexpected end of data"));
            }
            offset += n as u64;
            buf = &mut buf[n..];
        }
        Ok(())
    }
}

impl Source for [u8] {
    fn len(&self) -> u64 {
        <[u8]>::len(self) as u64
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        if offset >= Source::len(self) {
            return Ok(0);
        }
        let start = offset as usize;
        let n = buf.len().min(<[u8]>::len(self) - start);
        buf[..n].copy_from_slice(&self[start..start + n]);
        Ok(n)
    }
}

impl Source for Vec<u8> {
    fn len(&self) -> u64 {
        self.as_slice().len() as u64
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        self.as_slice().read_at(offset, buf)
    }
}

#[cfg(unix)]
pub struct FileSource {
    file: std::fs::File,
    len: u64,
}

#[cfg(unix)]
impl FileSource {
    pub fn open(path: &std::path::Path) -> io::Result<Self> {
        let file = std::fs::File::open(path)?;
        let len = file.metadata()?.len();
        Ok(Self { file, len })
    }
}

#[cfg(unix)]
impl Source for FileSource {
    fn len(&self) -> u64 {
        self.len
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        use std::os::unix::fs::FileExt;
        if offset >= self.len {
            return Ok(0);
        }
        self.file.read_at(buf, offset)
    }
}
