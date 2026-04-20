// Module Boundary: ai_copilot/
// Depends on: core/ (via pccx-core crate)
//
// pccx-ai-copilot: LLM wrapper and extension registry for pccx-lab.
// Provides context compression and extension catalogue for the Tauri UI.

use serde::{Deserialize, Serialize};

// ─── Extension Registry ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Extension {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Approximate download size in megabytes.
    pub size_mb: u32,
    pub is_installed: bool,
    /// Extension category for display grouping.
    pub category: ExtensionCategory,
    /// Minimum pccx-lab version required.
    pub min_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExtensionCategory {
    LocalLlm,
    HardwareAcceleration,
    CloudBridge,
    AnalysisPlugin,
    ExportPlugin,
}

impl std::fmt::Display for ExtensionCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LocalLlm              => write!(f, "Local LLM"),
            Self::HardwareAcceleration  => write!(f, "Hardware Acceleration"),
            Self::CloudBridge           => write!(f, "Cloud Bridge"),
            Self::AnalysisPlugin        => write!(f, "Analysis Plugin"),
            Self::ExportPlugin          => write!(f, "Export Plugin"),
        }
    }
}

/// Returns the full extension catalogue.
pub fn get_available_extensions() -> Vec<Extension> {
    vec![
        // ─── Local LLMs ──────────────────────────────────────────────────────
        Extension {
            id:           "llama-3-8b-q4".to_string(),
            name:         "Llama 3 (8B) — INT4 Quantised".to_string(),
            description:  "Local offline LLM for trace analysis and UVM generation. No data leaves the machine.".to_string(),
            size_mb:      4800,
            is_installed: false,
            category:     ExtensionCategory::LocalLlm,
            min_version:  "v0.3.0".to_string(),
        },
        Extension {
            id:           "qwen2-7b-q4".to_string(),
            name:         "Qwen2 (7B) — INT4 Quantised".to_string(),
            description:  "Multilingual local LLM with strong code generation. Supports Korean system-prompt.".to_string(),
            size_mb:      4200,
            is_installed: false,
            category:     ExtensionCategory::LocalLlm,
            min_version:  "v0.4.0".to_string(),
        },
        // ─── Hardware Acceleration ────────────────────────────────────────────
        Extension {
            id:           "onnx-cuda-ep".to_string(),
            name:         "ONNX Runtime (CUDA EP)".to_string(),
            description:  "GPU acceleration layer for local model inference via CUDA Execution Provider.".to_string(),
            size_mb:      320,
            is_installed: true,
            category:     ExtensionCategory::HardwareAcceleration,
            min_version:  "v0.2.0".to_string(),
        },
        Extension {
            id:           "vulkan-inference".to_string(),
            name:         "Vulkan Inference Backend".to_string(),
            description:  "Cross-platform GPU inference via Vulkan — works on AMD, Intel, and NVIDIA GPUs.".to_string(),
            size_mb:      85,
            is_installed: false,
            category:     ExtensionCategory::HardwareAcceleration,
            min_version:  "v0.4.0".to_string(),
        },
        // ─── Cloud Bridges ────────────────────────────────────────────────────
        Extension {
            id:           "gemini-cloud-bridge".to_string(),
            name:         "Gemini Pro Cloud Bridge".to_string(),
            description:  "Lightweight API bridge to Gemini Pro. Requires outbound HTTPS access.".to_string(),
            size_mb:      2,
            is_installed: true,
            category:     ExtensionCategory::CloudBridge,
            min_version:  "v0.1.0".to_string(),
        },
        Extension {
            id:           "claude-cloud-bridge".to_string(),
            name:         "Claude Sonnet Cloud Bridge".to_string(),
            description:  "API bridge to Anthropic Claude Sonnet for superior code/SV generation.".to_string(),
            size_mb:      2,
            is_installed: false,
            category:     ExtensionCategory::CloudBridge,
            min_version:  "v0.4.0".to_string(),
        },
        // ─── Analysis Plugins ─────────────────────────────────────────────────
        Extension {
            id:           "roofline-analyzer".to_string(),
            name:         "Roofline Model Analyser".to_string(),
            description:  "Generates compute/memory roofline plots from .pccx traces to identify bottlenecks.".to_string(),
            size_mb:      8,
            is_installed: false,
            category:     ExtensionCategory::AnalysisPlugin,
            min_version:  "v0.4.0".to_string(),
        },
        // ─── Export Plugins ───────────────────────────────────────────────────
        Extension {
            id:           "vcd-exporter".to_string(),
            name:         "VCD Wave Exporter".to_string(),
            description:  "Exports .pccx traces to Value Change Dump (.vcd) format for GTKWave / Verdi.".to_string(),
            size_mb:      3,
            is_installed: false,
            category:     ExtensionCategory::ExportPlugin,
            min_version:  "v0.4.0".to_string(),
        },
        Extension {
            id:           "chrome-trace-exporter".to_string(),
            name:         "Chrome Trace Exporter".to_string(),
            description:  "Converts .pccx events to chrome://tracing JSON for familiar GPU profiler UI.".to_string(),
            size_mb:      1,
            is_installed: false,
            category:     ExtensionCategory::ExportPlugin,
            min_version:  "v0.4.0".to_string(),
        },
    ]
}

// ─── Context Compression ──────────────────────────────────────────────────────

/// Compresses NPU trace statistics into a concise LLM prompt context string.
///
/// The output is designed to be prepended to any user query to give the LLM
/// enough context to reason about the trace without the full event list.
pub fn compress_context(cycles: u64, bottlenecks: usize) -> String {
    let bottleneck_desc = match bottlenecks {
        0 => "No significant DMA bottleneck intervals detected.".to_string(),
        1 => "1 high-occupancy DMA bottleneck interval detected.".to_string(),
        n => format!("{n} high-occupancy DMA bottleneck intervals detected."),
    };

    format!(
        "NPU trace: {cycles} total simulation cycles across a 32×32 systolic MAC array \
        with 32 cores at 1 GHz (est. {est_us:.1} µs wall-time). \
        {bottleneck_desc} \
        AXI bus contention visible during simultaneous multi-core DMA. \
        Peak theoretical: 2.05 TOPS.",
        cycles  = cycles,
        est_us  = cycles as f64 / 1000.0, // 1 GHz → µs
        bottleneck_desc = bottleneck_desc,
    )
}

/// Generates a UVM sequence stub for the given bottleneck mitigation strategy.
pub fn generate_uvm_sequence(strategy: &str) -> String {
    let (class_name, body) = match strategy {
        "l2_prefetch" => (
            "l2_prefetch_seq",
            "// Stagger DMA requests by AXI transaction overhead (15 cycles)\n\
             foreach (cores[i]) begin\n\
               start_item(new dma_read_item(base_addr + i * stride, burst_len));\n\
               finish_item();\n\
               repeat(15) @(posedge clk);\n\
             end"
        ),
        "barrier_reduction" => (
            "barrier_reduction_seq",
            "// Use wavefront barrier instead of global sync\n\
             for (int i = 0; i < NUM_CORES; i += WAVEFRONT_WIDTH) begin\n\
               fork foreach_wavefront(i, WAVEFRONT_WIDTH); join_none\n\
             end\n\
             wait fork;"
        ),
        _ => (
            "generic_opt_seq",
            "// TODO: implement optimisation-specific sequence"
        ),
    };

    format!(
        "class {class_name} extends uvm_sequence;\n\
         `uvm_object_utils({class_name})\n\
         \n\
         task body();\n\
           {body}\n\
         endtask\n\
         endclass : {class_name}",
        class_name = class_name,
        body = body,
    )
}
