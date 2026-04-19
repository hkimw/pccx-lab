// Module Boundary: ai_copilot/
// Depends on: core/

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Extension {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_mb: u32,
    pub is_installed: bool,
}

pub fn get_available_extensions() -> Vec<Extension> {
    vec![
        Extension {
            id: "llama-3-8b-instruct-q4".to_string(),
            name: "Llama 3 (8B) - Quantized".to_string(),
            description: "Local LLM engine for offline trace analysis and UVM generation.".to_string(),
            size_mb: 4800,
            is_installed: false,
        },
        Extension {
            id: "onnx-cuda-ep".to_string(),
            name: "ONNX Runtime (CUDA Execution Provider)".to_string(),
            description: "Hardware acceleration layer for local models.".to_string(),
            size_mb: 320,
            is_installed: true,
        },
        Extension {
            id: "gemini-cloud-bridge".to_string(),
            name: "Gemini Pro Cloud Bridge".to_string(),
            description: "Default lightweight bridge for enterprise environments with outbound API access.".to_string(),
            size_mb: 2,
            is_installed: true,
        }
    ]
}

// Dummy context compression
pub fn compress_context(cycles: u64, bottlenecks: usize) -> String {
    format!("Trace length: {} cycles. Identified {} potential bottleneck intervals. Provide optimization strategies.", cycles, bottlenecks)
}
