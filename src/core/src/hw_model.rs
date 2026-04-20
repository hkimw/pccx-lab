// Module Boundary: core/
// Hardware model specification for the pccx NPU architecture.

/// AXI bus configuration.
#[derive(Debug, Clone)]
pub struct AxiBusConfig {
    /// Burst bandwidth in bytes per clock cycle.
    pub bandwidth_bytes_per_cycle: u32,
    /// AXI burst length (beats per transaction).
    pub burst_length: u32,
    /// Fixed overhead cycles per AXI transaction (address phase + handshake).
    pub transaction_overhead_cycles: u32,
}

impl Default for AxiBusConfig {
    fn default() -> Self {
        Self {
            bandwidth_bytes_per_cycle: 16,
            burst_length: 16,
            transaction_overhead_cycles: 15,
        }
    }
}

/// On-chip BRAM / scratchpad configuration.
#[derive(Debug, Clone)]
pub struct BramConfig {
    pub capacity_bytes: u32,
    pub read_bandwidth_bytes_per_cycle: u32,
    pub write_bandwidth_bytes_per_cycle: u32,
    /// Number of read ports (for multi-bank access).
    pub read_ports: u32,
}

impl Default for BramConfig {
    fn default() -> Self {
        Self {
            capacity_bytes: 1024 * 1024,
            read_bandwidth_bytes_per_cycle: 64,
            write_bandwidth_bytes_per_cycle: 64,
            read_ports: 2,
        }
    }
}

/// Systolic MAC array configuration.
#[derive(Debug, Clone)]
pub struct MacArrayConfig {
    /// Number of rows in the 2-D MAC array.
    pub rows: u32,
    /// Number of columns in the 2-D MAC array.
    pub cols: u32,
    /// Pipeline depth (latency slots before first output is valid).
    pub pipeline_depth: u32,
}

impl Default for MacArrayConfig {
    fn default() -> Self {
        Self {
            rows: 32,
            cols: 32,
            pipeline_depth: 10,
        }
    }
}

/// Top-level hardware model that completely describes the simulated NPU chip.
#[derive(Debug, Clone)]
pub struct HardwareModel {
    pub axi: AxiBusConfig,
    pub bram: BramConfig,
    pub mac: MacArrayConfig,
    /// Clock frequency in MHz (used for wall-clock time conversion).
    pub clock_mhz: u32,
    /// Number of independent processing cores sharing the AXI bus.
    pub num_cores: u32,
    /// Width of SIMD/vector lanes (bytes, for future vectorised ISA extensions).
    pub vector_lane_bytes: u32,
}

impl HardwareModel {
    pub fn new(axi: AxiBusConfig, bram: BramConfig, mac: MacArrayConfig) -> Self {
        Self {
            axi,
            bram,
            mac,
            clock_mhz: 1000,
            num_cores: 32,
            vector_lane_bytes: 16,
        }
    }

    /// Creates the default pccx reference NPU configuration (32×32 MAC, 1 GHz, 32 cores).
    pub fn pccx_reference() -> Self {
        Self {
            axi: AxiBusConfig::default(),
            bram: BramConfig::default(),
            mac: MacArrayConfig::default(),
            clock_mhz: 1000,
            num_cores: 32,
            vector_lane_bytes: 16,
        }
    }

    /// Converts a cycle count to wall-clock microseconds based on `clock_mhz`.
    pub fn cycles_to_us(&self, cycles: u64) -> f64 {
        cycles as f64 / self.clock_mhz as f64
    }

    /// Returns total theoretical TOPS (tera-operations per second) of the MAC array.
    pub fn peak_tops(&self) -> f64 {
        let macs_per_cycle = self.mac.rows as f64 * self.mac.cols as f64 * self.num_cores as f64;
        // 2 ops per MAC (multiply + accumulate), convert to TOPS
        macs_per_cycle * 2.0 * self.clock_mhz as f64 * 1e6 / 1e12
    }
}
