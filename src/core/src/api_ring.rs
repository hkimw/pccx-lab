// Module Boundary: core/
// API-integrity ring buffer — records every `uca_*` driver entry /
// exit and flushes the aggregate p99 latency + drop count to a
// fixed-schema row vector the UI's API-Integrity panel renders.
//
// The ring is the same pattern as Nsight's CUPTI driver trace:
// every boundary crossing adds `(api, ns)` pair; periodic flush
// computes the p99 and clears.  For Round-2 T-1 we keep it simple —
// no thread-safety, no atomics — because the caller is the single
// Tauri command thread populating from a `.pccx` event stream.

use serde::{Deserialize, Serialize};

/// One summarised row per `uca_*` surface call.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApiCall {
    /// Fully qualified API name: `"uca_submit_cmd"`.
    pub api:             String,
    /// Bucket tag: lifecycle / memory / transfer / dispatch / status / debug.
    pub kind:            String,
    /// p99 latency in nanoseconds across all samples in the ring.
    pub p99_latency_ns:  u64,
    /// Count of dropped / truncated events observed.
    pub drops:           u64,
    /// OK | WARN | FAIL.
    pub status:          ApiStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum ApiStatus { Ok, Warn, Fail }

/// Fixed-capacity ring of raw (api, kind, latency_ns) samples.
/// Fills to capacity then wraps (oldest drops are tallied).
#[derive(Debug, Clone)]
pub struct ApiRing {
    buf:      Vec<(String, String, u64)>,
    capacity: usize,
    head:     usize,
    filled:   bool,
    dropped:  u64,
}

impl ApiRing {
    pub fn new(capacity: usize) -> Self {
        Self {
            buf:      Vec::with_capacity(capacity.max(1)),
            capacity: capacity.max(1),
            head:     0,
            filled:   false,
            dropped:  0,
        }
    }

    /// Records one boundary crossing.  When the ring is full the
    /// oldest sample is silently overwritten and `dropped` is
    /// incremented.
    pub fn record(&mut self, api: &str, kind: &str, latency_ns: u64) {
        let sample = (api.to_string(), kind.to_string(), latency_ns);
        if self.buf.len() < self.capacity {
            self.buf.push(sample);
        } else {
            self.buf[self.head] = sample;
            self.filled = true;
            self.dropped += 1;
        }
        self.head = (self.head + 1) % self.capacity;
    }

    /// Flushes the ring into `Vec<ApiCall>` — one row per distinct
    /// `(api, kind)` pair with the p99 latency over its samples.
    /// p99 is interpolated via the nearest-rank method (Hyndman &
    /// Fan, 1996 type 1): `rank = ceil(0.99 * n)`.
    pub fn flush(&self) -> Vec<ApiCall> {
        use std::collections::BTreeMap;
        let mut buckets: BTreeMap<(String, String), Vec<u64>> = BTreeMap::new();
        for (api, kind, lat) in &self.buf {
            buckets.entry((api.clone(), kind.clone())).or_default().push(*lat);
        }
        buckets.into_iter().map(|((api, kind), mut lats)| {
            lats.sort_unstable();
            let n    = lats.len();
            let rank = ((0.99 * n as f64).ceil() as usize).saturating_sub(1).min(n - 1);
            let p99  = lats[rank];
            // Classify: > 1 ms → WARN, > 10 ms → FAIL.
            let status = if p99 > 10_000_000 {
                ApiStatus::Fail
            } else if p99 > 1_000_000 {
                ApiStatus::Warn
            } else {
                ApiStatus::Ok
            };
            ApiCall {
                api,
                kind,
                p99_latency_ns: p99,
                drops:          self.dropped,
                status,
            }
        }).collect()
    }

    pub fn len(&self)     -> usize { self.buf.len() }
    pub fn is_empty(&self) -> bool { self.buf.is_empty() }
    pub fn dropped(&self)  -> u64  { self.dropped }
    pub fn filled(&self)   -> bool { self.filled }
}

/// Produces a synthetic-fallback `Vec<ApiCall>` from the default
/// generated trace so the UI has *something* deterministic to render
/// before a real `.pccx` file is loaded.  This is not a cosmetic
/// mock — it is the ring populated from an 8-call warm-up that
/// exercises every canonical `uca_*` name.  The caller (the
/// `list_api_calls` Tauri command) uses this when no real trace
/// is cached; once a trace lands the ring replays real event-stream
/// boundaries.
pub fn synthetic_fallback() -> Vec<ApiCall> {
    let mut r = ApiRing::new(128);
    // Warm-up sequence modelled on `ScenarioFlow.tsx` (the canonical
    // inference pipeline).  Latency numbers are the ones the v002
    // driver README cites for the KV260 reference SoC.
    r.record("uca_init",              "lifecycle", 4_100);
    r.record("uca_alloc_buffer",      "memory",    12_600);
    r.record("uca_load_weights",      "transfer",  1_420_000);
    r.record("uca_submit_cmd",        "dispatch",  1_800);
    r.record("uca_poll_completion",   "status",    300);
    r.record("uca_fetch_result",      "transfer",  920_000);
    r.record("uca_reset",             "lifecycle", 8_700);
    r.record("uca_get_perf_counters", "debug",     5_200);
    r.flush()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_ring_flushes_empty() {
        let r = ApiRing::new(16);
        assert!(r.flush().is_empty());
        assert_eq!(r.len(),     0);
        assert_eq!(r.dropped(), 0);
    }

    #[test]
    fn records_and_flushes_single_row() {
        let mut r = ApiRing::new(4);
        r.record("uca_init", "lifecycle", 4_100);
        let rows = r.flush();
        assert_eq!(rows.len(),             1);
        assert_eq!(rows[0].api,            "uca_init");
        assert_eq!(rows[0].kind,           "lifecycle");
        assert_eq!(rows[0].p99_latency_ns, 4_100);
        assert_eq!(rows[0].status,         ApiStatus::Ok);
    }

    #[test]
    fn ring_wraps_and_counts_drops() {
        let mut r = ApiRing::new(2);
        r.record("uca_a", "k", 100);
        r.record("uca_b", "k", 200);
        r.record("uca_c", "k", 300);      // overwrites uca_a
        r.record("uca_d", "k", 400);      // overwrites uca_b
        assert_eq!(r.len(),     2);
        assert_eq!(r.dropped(), 2);
        assert!(r.filled());
        let rows = r.flush();
        // Only the two newest should remain in the bucket sort.
        let apis: Vec<&str> = rows.iter().map(|r| r.api.as_str()).collect();
        assert!(apis.contains(&"uca_c"));
        assert!(apis.contains(&"uca_d"));
    }

    #[test]
    fn classifies_slow_call_as_warn() {
        let mut r = ApiRing::new(8);
        // 2 ms p99 → WARN
        r.record("uca_load_weights", "transfer", 2_000_000);
        let rows = r.flush();
        assert_eq!(rows[0].status, ApiStatus::Warn);
    }

    #[test]
    fn classifies_very_slow_call_as_fail() {
        let mut r = ApiRing::new(8);
        r.record("uca_pathological", "transfer", 50_000_000);
        let rows = r.flush();
        assert_eq!(rows[0].status, ApiStatus::Fail);
    }

    #[test]
    fn synthetic_fallback_covers_eight_canonical_apis() {
        let rows = synthetic_fallback();
        assert_eq!(rows.len(), 8);
        let names: Vec<&str> = rows.iter().map(|r| r.api.as_str()).collect();
        for expected in ["uca_init", "uca_alloc_buffer", "uca_load_weights",
                         "uca_submit_cmd", "uca_poll_completion",
                         "uca_fetch_result", "uca_reset",
                         "uca_get_perf_counters"] {
            assert!(names.contains(&expected),
                    "synthetic_fallback missing {}", expected);
        }
    }
}
