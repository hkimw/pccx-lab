// Module Boundary: core/
// NPU Trace data structures and serialization utilities.
use serde::{Deserialize, Serialize};

/// Canonical event type IDs used in the flat binary buffer.
/// These MUST be kept in sync with the JS DataView parsing logic.
pub mod event_type_id {
    pub const UNKNOWN: u32 = 0;
    pub const MAC_COMPUTE: u32 = 1;
    pub const DMA_READ: u32 = 2;
    pub const DMA_WRITE: u32 = 3;
    pub const SYSTOLIC_STALL: u32 = 4;
    pub const BARRIER_SYNC: u32 = 5;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpuEvent {
    pub core_id: u32,
    pub start_cycle: u64,
    pub duration: u64,
    /// String tag — canonical values: "MAC_COMPUTE", "DMA_READ", "DMA_WRITE",
    /// "SYSTOLIC_STALL", "BARRIER_SYNC"
    pub event_type: String,
}

impl NpuEvent {
    /// Returns the numeric event-type ID for this event.
    /// Centralising this lookup ensures flat_buffer and any future codec stay in sync.
    pub fn type_id(&self) -> u32 {
        match self.event_type.as_str() {
            "MAC_COMPUTE"    => event_type_id::MAC_COMPUTE,
            "DMA_READ"       => event_type_id::DMA_READ,
            "DMA_WRITE"      => event_type_id::DMA_WRITE,
            "SYSTOLIC_STALL" => event_type_id::SYSTOLIC_STALL,
            "BARRIER_SYNC"   => event_type_id::BARRIER_SYNC,
            _                => event_type_id::UNKNOWN,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpuTrace {
    pub total_cycles: u64,
    pub events: Vec<NpuEvent>,
}

impl NpuTrace {
    /// Serialises the trace into a high-performance binary payload using Bincode.
    pub fn to_payload(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }

    pub fn from_payload(payload: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(payload)
    }

    /// Creates a flat binary buffer optimised for WebGL / JS TypedArray mapping.
    ///
    /// Struct layout per event (24 bytes total, all little-endian):
    /// | Offset | Size | Field         |
    /// |--------|------|---------------|
    /// |  0     |  4   | core_id: u32  |
    /// |  4     |  8   | start_cycle: u64 |
    /// | 12     |  8   | duration: u64 |
    /// | 20     |  4   | event_type_id: u32 |
    pub fn to_flat_buffer(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.events.len() * 24);
        for ev in &self.events {
            buf.extend_from_slice(&ev.core_id.to_le_bytes());
            buf.extend_from_slice(&ev.start_cycle.to_le_bytes());
            buf.extend_from_slice(&ev.duration.to_le_bytes());
            buf.extend_from_slice(&ev.type_id().to_le_bytes());
        }
        buf
    }

    /// Returns per-core utilisation in [0.0, 1.0] over the entire trace window.
    pub fn core_utilisation(&self) -> Vec<(u32, f64)> {
        if self.total_cycles == 0 {
            return vec![];
        }
        // Accumulate active (compute) cycles per core.
        let mut compute_map: std::collections::HashMap<u32, u64> = std::collections::HashMap::new();
        for ev in &self.events {
            if ev.event_type == "MAC_COMPUTE" {
                *compute_map.entry(ev.core_id).or_insert(0) += ev.duration;
            }
        }
        let mut result: Vec<(u32, f64)> = compute_map
            .into_iter()
            .map(|(core, cycles)| {
                let util = (cycles as f64) / (self.total_cycles as f64);
                (core, util.min(1.0))
            })
            .collect();
        result.sort_by_key(|(core, _)| *core);
        result
    }

    /// Identifies events where DMA bandwidth occupancy exceeds the given ratio threshold
    /// compared to the compute window, flagging potential bottleneck intervals.
    pub fn dma_bottleneck_intervals(&self, threshold_ratio: f64) -> Vec<&NpuEvent> {
        self.events
            .iter()
            .filter(|ev| {
                (ev.event_type == "DMA_READ" || ev.event_type == "DMA_WRITE")
                    && (ev.duration as f64) > threshold_ratio * (self.total_cycles as f64 / 100.0)
            })
            .collect()
    }
}
