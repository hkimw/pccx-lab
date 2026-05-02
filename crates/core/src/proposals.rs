//! Proposal-only workflow previews shared by CLI/core and GUI consumers.

use serde::{Deserialize, Serialize};

pub const WORKFLOW_PROPOSAL_SCHEMA_VERSION: &str = "pccx.lab.workflow-proposals.v0";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowProposalSet {
    pub schema_version: String,
    pub tool: String,
    pub proposals: Vec<WorkflowProposal>,
    pub limitations: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowProposal {
    pub proposal_id: String,
    pub workflow_id: String,
    pub label: String,
    pub proposal_state: String,
    pub approval_required: bool,
    pub command_kind: String,
    pub fixed_args_preview: Vec<String>,
    pub input_summary: String,
    pub output_policy: String,
    pub safety_flags: Vec<String>,
    pub expected_artifacts: Vec<String>,
    pub limitations: Vec<String>,
}

struct ProposalSpec<'a> {
    proposal_id: &'a str,
    workflow_id: &'a str,
    label: &'a str,
    approval_required: bool,
    command_kind: &'a str,
    fixed_args_preview: &'a [&'a str],
    input_summary: &'a str,
    output_policy: &'a str,
    expected_artifacts: &'a [&'a str],
    limitations: &'a [&'a str],
}

fn proposal(spec: ProposalSpec<'_>) -> WorkflowProposal {
    WorkflowProposal {
        proposal_id: spec.proposal_id.to_string(),
        workflow_id: spec.workflow_id.to_string(),
        label: spec.label.to_string(),
        proposal_state: "proposal_only".to_string(),
        approval_required: spec.approval_required,
        command_kind: spec.command_kind.to_string(),
        fixed_args_preview: spec
            .fixed_args_preview
            .iter()
            .map(|item| item.to_string())
            .collect(),
        input_summary: spec.input_summary.to_string(),
        output_policy: spec.output_policy.to_string(),
        safety_flags: vec![
            "no-execution".to_string(),
            "no-shell".to_string(),
            "fixed-args-preview".to_string(),
            "approval-boundary-required-before-run".to_string(),
            "no-hardware".to_string(),
            "no-fpga-repo".to_string(),
            "no-network".to_string(),
            "no-provider-call".to_string(),
            "no-private-paths".to_string(),
            "no-secrets".to_string(),
        ],
        expected_artifacts: spec
            .expected_artifacts
            .iter()
            .map(|item| item.to_string())
            .collect(),
        limitations: spec
            .limitations
            .iter()
            .map(|item| item.to_string())
            .collect(),
    }
}

pub fn workflow_proposals() -> WorkflowProposalSet {
    WorkflowProposalSet {
        schema_version: WORKFLOW_PROPOSAL_SCHEMA_VERSION.to_string(),
        tool: "pccx-lab".to_string(),
        proposals: vec![
            proposal(ProposalSpec {
                proposal_id: "proposal-lab-status-contract",
                workflow_id: "lab-status-contract",
                label: "Preview lab status contract read",
                approval_required: false,
                command_kind: "pccx-lab-cli-fixed-args",
                fixed_args_preview: &["status", "--format", "json"],
                input_summary: "No runtime input; static host status metadata only.",
                output_policy: "Bounded status JSON with conservative evidence markers.",
                expected_artifacts: &[],
                limitations: &[
                    "Proposal listing does not run the status command.",
                    "Status output does not claim hardware, timing, inference, or throughput evidence.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-theme-token-contract",
                workflow_id: "theme-token-contract",
                label: "Preview theme token contract read",
                approval_required: false,
                command_kind: "pccx-lab-cli-fixed-args",
                fixed_args_preview: &["theme", "--format", "json"],
                input_summary: "No runtime input; semantic theme-token metadata only.",
                output_policy: "Bounded theme-token JSON with named presets.",
                expected_artifacts: &[],
                limitations: &[
                    "Proposal listing does not run the theme command.",
                    "Theme tokens are experimental semantic slots.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-workflow-descriptor-catalog",
                workflow_id: "workflow-descriptor-catalog",
                label: "Preview workflow descriptor catalog read",
                approval_required: false,
                command_kind: "pccx-lab-cli-fixed-args",
                fixed_args_preview: &["workflows", "--format", "json"],
                input_summary: "No runtime input; descriptor-only metadata only.",
                output_policy: "Bounded descriptor JSON with no execution state.",
                expected_artifacts: &[],
                limitations: &[
                    "Proposal listing does not run the workflows command.",
                    "Descriptor metadata does not implement an MCP runtime.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-workflow-proposal-catalog",
                workflow_id: "workflow-proposal-catalog",
                label: "Preview workflow proposal catalog read",
                approval_required: false,
                command_kind: "pccx-lab-cli-fixed-args",
                fixed_args_preview: &["workflow-proposals", "--format", "json"],
                input_summary: "No runtime input; proposal-only metadata only.",
                output_policy: "Bounded proposal JSON with no execution state.",
                expected_artifacts: &[],
                limitations: &[
                    "Proposal listing does not run the workflow-proposals command.",
                    "Proposal metadata does not implement a runner.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-systemverilog-shape-diagnostics",
                workflow_id: "systemverilog-shape-diagnostics",
                label: "Preview SystemVerilog shape diagnostics",
                approval_required: true,
                command_kind: "pccx-lab-cli-fixed-args-with-approved-input",
                fixed_args_preview: &["analyze", "<approved-file>", "--format", "json"],
                input_summary: "Requires one approved local SystemVerilog file path in a later boundary.",
                output_policy: "Bounded diagnostics JSON; no semantic verification or hardware run.",
                expected_artifacts: &[],
                limitations: &[
                    "Proposal listing does not read files.",
                    "Any future run must approve the file input before execution.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-trace-import-summary",
                workflow_id: "trace-import-summary",
                label: "Preview trace import summary",
                approval_required: true,
                command_kind: "planned-core-boundary",
                fixed_args_preview: &[],
                input_summary: "Would require an approved local trace file in a later boundary.",
                output_policy: "Future output should be summary-only trace metadata.",
                expected_artifacts: &[],
                limitations: &[
                    "No trace is loaded by proposal listing.",
                    "No raw trace payload crosses this proposal boundary.",
                ],
            }),
            proposal(ProposalSpec {
                proposal_id: "proposal-verification-report-summary",
                workflow_id: "verification-report-summary",
                label: "Preview verification report summary",
                approval_required: true,
                command_kind: "planned-core-boundary",
                fixed_args_preview: &[],
                input_summary: "Would require an approved report source in a later boundary.",
                output_policy: "Future output should be summary-only report metadata.",
                expected_artifacts: &[],
                limitations: &[
                    "No verification script is launched by proposal listing.",
                    "No timing closure or hardware result is claimed.",
                ],
            }),
        ],
        limitations: vec![
            "Workflow proposals are previews only and never execute workflows.".to_string(),
            "Fixed argument previews are token arrays, not raw shell strings.".to_string(),
            "A separate approval boundary is required before any future run.".to_string(),
            "No hardware, provider, network, MCP, launcher, or IDE runtime is invoked."
                .to_string(),
            "The FPGA repo is not required and is not touched by proposal listing.".to_string(),
        ],
    }
}

pub fn workflow_proposals_json_pretty() -> serde_json::Result<String> {
    serde_json::to_string_pretty(&workflow_proposals())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn workflow_proposals_have_required_shape() {
        let set = workflow_proposals();
        assert_eq!(set.schema_version, WORKFLOW_PROPOSAL_SCHEMA_VERSION);
        assert_eq!(set.tool, "pccx-lab");
        assert!(set.proposals.len() >= 5);

        for item in set.proposals {
            assert!(!item.proposal_id.is_empty());
            assert!(!item.workflow_id.is_empty());
            assert_eq!(item.proposal_state, "proposal_only");
            assert!(item.safety_flags.iter().any(|flag| flag == "no-execution"));
            assert!(item.expected_artifacts.is_empty());
        }
    }

    #[test]
    fn workflow_proposals_reference_known_descriptors() {
        let descriptor_ids: HashSet<String> = crate::workflows::workflow_descriptors()
            .descriptors
            .into_iter()
            .map(|descriptor| descriptor.workflow_id)
            .collect();

        for item in workflow_proposals().proposals {
            assert!(
                descriptor_ids.contains(&item.workflow_id),
                "proposal references unknown workflow: {}",
                item.workflow_id
            );
        }
    }

    #[test]
    fn workflow_proposals_do_not_use_shell_strings() {
        for item in workflow_proposals().proposals {
            for arg in item.fixed_args_preview {
                assert!(!arg.contains(';'));
                assert!(!arg.contains("&&"));
                assert!(!arg.contains('|'));
                assert!(!arg.contains('\n'));
                assert!(!arg.contains('\t'));
                assert_ne!(arg, "sh");
                assert_ne!(arg, "bash");
                assert_ne!(arg, "cmd");
                assert_ne!(arg, "powershell");
            }
        }
    }

    #[test]
    fn workflow_proposals_serialize_deterministically() {
        let first = workflow_proposals_json_pretty().unwrap();
        let second = workflow_proposals_json_pretty().unwrap();
        assert_eq!(first, second);
    }
}
