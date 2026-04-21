// Module Boundary: core/
// Roofline-model analysis for pccx-lab traces.
//
// Given an NpuTrace and a HardwareModel, computes the arithmetic
// intensity (ops / byte) and the achieved throughput (GOPS), and
// classifies the workload as compute-bound or memory-bound against
// the hardware's peak TOPS and AXI bandwidth ceiling.

use crate::hw_model::HardwareModel;
use crate::trace::{event_type_id, NpuTrace};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RooflinePoint {
    pub arithmetic_intensity: f64,
    pub achieved_gops:        f64,
    pub peak_gops:            f64,
    pub peak_bw_gbps:         f64,
    /// `true` if the workload is bottlenecked on compute; `false` if
    /// memory bandwidth is the binding constraint.
    pub compute_bound:        bool,
    pub mac_cycles:            u64,
    pub dma_bytes_estimate:    u64,
    pub total_cycles:          u64,
}

pub fn analyze(trace: &NpuTrace, hw: &HardwareModel) -> RooflinePoint {
    let mut mac_cycles: u64 = 0;
    let mut dma_read_cycles:  u64 = 0;
    let mut dma_write_cycles: u64 = 0;

    for ev in &trace.events {
        match ev.type_id() {
            id if id == event_type_id::MAC_COMPUTE => mac_cycles      += ev.duration,
            id if id == event_type_id::DMA_READ    => dma_read_cycles  += ev.duration,
            id if id == event_type_id::DMA_WRITE   => dma_write_cycles += ev.duration,
            _ => {}
        }
    }

    // MAC ops: one MAC = 2 FLOPs (mul + add). mac_cycles already multiplied
    // by duration, so total MACs is mac_cycles * (rows * cols per cycle).
    let macs_per_cycle = (hw.mac.rows as u64) * (hw.mac.cols as u64);
    let total_ops = mac_cycles.saturating_mul(macs_per_cycle).saturating_mul(2);

    // Rough byte volume: AXI bus carries HP_PORT_WIDTH * cycle for every DMA.
    // Use the hw model's axi configuration.
    let axi_bytes_per_cycle = (hw.axi.bandwidth_bytes_per_cycle as u64).max(1);
    let dma_bytes_estimate =
        (dma_read_cycles + dma_write_cycles).saturating_mul(axi_bytes_per_cycle);

    // Arithmetic intensity: 0 when there's no work at all, +∞ when there's
    // compute but no memory traffic (pure MAC streams are compute-bound by
    // definition), otherwise ops/bytes.
    let arithmetic_intensity = if total_ops == 0 && dma_bytes_estimate == 0 {
        0.0
    } else if dma_bytes_estimate == 0 {
        f64::INFINITY
    } else {
        total_ops as f64 / dma_bytes_estimate as f64
    };

    let clock_ghz = hw.clock_mhz as f64 / 1000.0;
    let wall_seconds = if trace.total_cycles == 0 {
        0.0
    } else {
        trace.total_cycles as f64 / (clock_ghz * 1e9)
    };
    let achieved_gops = if wall_seconds > 0.0 {
        total_ops as f64 / 1e9 / wall_seconds
    } else {
        0.0
    };

    let peak_gops    = hw.peak_tops() * 1000.0;                // TOPS -> GOPS
    let peak_bw_gbps = axi_bytes_per_cycle as f64 * clock_ghz; // bytes/cycle × GHz = GB/s

    // Knee of the roofline: AI at which compute and memory ceilings meet.
    // Below the knee → memory-bound; above → compute-bound.
    let knee_ai = if peak_bw_gbps > 0.0 { peak_gops / peak_bw_gbps } else { f64::INFINITY };
    let compute_bound = arithmetic_intensity >= knee_ai;

    RooflinePoint {
        arithmetic_intensity,
        achieved_gops,
        peak_gops,
        peak_bw_gbps,
        compute_bound,
        mac_cycles,
        dma_bytes_estimate,
        total_cycles: trace.total_cycles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trace::NpuEvent;

    fn mk_event(t: &str, start: u64, dur: u64) -> NpuEvent {
        NpuEvent::new(0, start, dur, t)
    }

    #[test]
    fn test_empty_trace_returns_zero_intensity() {
        let hw = HardwareModel::pccx_reference();
        let trace = NpuTrace { total_cycles: 0, events: vec![] };
        let r = analyze(&trace, &hw);
        assert_eq!(r.arithmetic_intensity, 0.0);
        assert_eq!(r.achieved_gops,        0.0);
        assert!(!r.compute_bound, "empty trace cannot be compute-bound");
    }

    #[test]
    fn test_all_mac_trace_is_compute_bound() {
        let hw = HardwareModel::pccx_reference();
        let trace = NpuTrace {
            total_cycles: 100,
            events: vec![mk_event("MAC_COMPUTE", 0, 100)],
        };
        let r = analyze(&trace, &hw);
        assert_eq!(r.mac_cycles, 100);
        assert_eq!(r.dma_bytes_estimate, 0);
        // No DMA -> infinite intensity -> compute-bound.
        assert!(r.compute_bound);
    }

    #[test]
    fn test_all_dma_trace_is_memory_bound() {
        let hw = HardwareModel::pccx_reference();
        let trace = NpuTrace {
            total_cycles: 100,
            events: vec![mk_event("DMA_READ", 0, 100)],
        };
        let r = analyze(&trace, &hw);
        assert_eq!(r.mac_cycles, 0);
        assert!(r.dma_bytes_estimate > 0);
        assert!(!r.compute_bound, "pure DMA workload must be memory-bound");
    }

    #[test]
    fn test_peak_gops_matches_hw_model() {
        let hw = HardwareModel::pccx_reference();
        let trace = NpuTrace { total_cycles: 1000, events: vec![] };
        let r = analyze(&trace, &hw);
        // peak_gops reported in GOPS, hw.peak_tops() in TOPS.
        assert!((r.peak_gops - hw.peak_tops() * 1000.0).abs() < 1e-6);
    }
}
