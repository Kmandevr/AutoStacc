// AutoStacc processing engine: the CPU-heavy work on creators' files, with no network or database access of its own.
// The same code runs natively in the server Container (main.rs) and as WebAssembly in the Pack Builder (abi.rs).
// Callers hand it a `Source` (random-access bytes); it answers with plain data that serializes to the job contract.
pub mod facts;
pub mod formats;
pub mod hash;
pub mod job;
pub mod source;
pub mod zipread;

#[cfg(target_arch = "wasm32")]
mod abi;

pub use source::Source;

/// Engine version recorded with every result, so stored facts can be traced to the code that made them.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Version of the JSON job contract (engine/contract/), bumped only for breaking changes.
pub const CONTRACT_VERSION: u32 = 1;
