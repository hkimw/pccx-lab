// workflow_proposals_cli — end-to-end CLI tests for proposal-only workflow previews.

use std::collections::HashSet;
use std::process::Command;

fn bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pccx-lab"))
}

fn proposals_json() -> serde_json::Value {
    let out = bin()
        .args(["workflow-proposals", "--format", "json"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format json");

    assert_eq!(out.status.code(), Some(0));
    serde_json::from_slice(&out.stdout).expect("workflow-proposals stdout is not valid JSON")
}

#[test]
fn workflow_proposals_command_emits_catalog() {
    let parsed = proposals_json();

    assert_eq!(parsed["schemaVersion"], "pccx.lab.workflow-proposals.v0");
    assert_eq!(parsed["tool"], "pccx-lab");

    let proposals = parsed["proposals"]
        .as_array()
        .expect("proposals must be an array");
    assert!(proposals.len() >= 5, "expected proposal previews");
}

#[test]
fn workflow_proposals_command_is_deterministic() {
    let first = bin()
        .args(["workflow-proposals", "--format", "json"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format json");
    let second = bin()
        .args(["workflow-proposals", "--format", "json"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format json");

    assert_eq!(first.status.code(), Some(0));
    assert_eq!(second.status.code(), Some(0));
    assert_eq!(first.stdout, second.stdout);
}

#[test]
fn workflow_proposals_reject_unsupported_format() {
    let out = bin()
        .args(["workflow-proposals", "--format", "text"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format text");

    assert_eq!(out.status.code(), Some(2));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("unsupported format"));
}

#[test]
fn workflow_proposals_are_proposal_only() {
    let parsed = proposals_json();
    let proposals = parsed["proposals"]
        .as_array()
        .expect("proposals must be an array");

    for item in proposals {
        assert_eq!(
            item["proposalState"].as_str().unwrap_or(""),
            "proposal_only",
            "proposal must not advertise execution"
        );

        let flags = item["safetyFlags"]
            .as_array()
            .expect("safetyFlags must be an array");
        assert!(flags.iter().any(|flag| flag == "no-execution"));
        assert!(flags
            .iter()
            .any(|flag| flag == "approval-boundary-required-before-run"));
        assert_eq!(
            item["expectedArtifacts"].as_array().map(Vec::len),
            Some(0),
            "proposal listing must not claim generated artifacts"
        );
    }
}

#[test]
fn workflow_proposals_reference_known_workflow_ids() {
    let descriptor_ids: HashSet<String> = pccx_core::workflow_descriptors()
        .descriptors
        .into_iter()
        .map(|descriptor| descriptor.workflow_id)
        .collect();

    let parsed = proposals_json();
    let proposals = parsed["proposals"]
        .as_array()
        .expect("proposals must be an array");

    for item in proposals {
        let workflow_id = item["workflowId"].as_str().expect("workflowId missing");
        assert!(
            descriptor_ids.contains(workflow_id),
            "proposal references unknown workflowId: {workflow_id}"
        );
    }
}

#[test]
fn workflow_proposals_use_bounded_arg_tokens_not_shell_strings() {
    let parsed = proposals_json();
    let proposals = parsed["proposals"]
        .as_array()
        .expect("proposals must be an array");

    for item in proposals {
        let args = item["fixedArgsPreview"]
            .as_array()
            .expect("fixedArgsPreview must be an array");
        assert!(args.len() <= 4, "fixedArgsPreview must stay bounded");

        for arg in args {
            let value = arg.as_str().expect("arg token must be a string");
            assert!(!value.contains(char::is_whitespace));
            assert!(!value.contains(';'));
            assert!(!value.contains("&&"));
            assert!(!value.contains('|'));
            assert_ne!(value, "sh");
            assert_ne!(value, "bash");
            assert_ne!(value, "cmd");
            assert_ne!(value, "powershell");
        }
    }
}

#[test]
fn workflow_proposals_do_not_expose_private_paths_or_secrets() {
    let out = bin()
        .args(["workflow-proposals", "--format", "json"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format json");
    assert_eq!(out.status.code(), Some(0));

    let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
    for phrase in [
        "/home/",
        "sk-",
        "ghp_",
        "github_pat_",
        "private key",
        "begin rsa private key",
        "begin openssh private key",
    ] {
        assert!(
            !text.contains(phrase),
            "workflow proposals contain private path or secret marker: {phrase}"
        );
    }
}

#[test]
fn workflow_proposals_do_not_claim_unsupported_runtime_state() {
    let out = bin()
        .args(["workflow-proposals", "--format", "json"])
        .output()
        .expect("failed to run pccx-lab workflow-proposals --format json");
    assert_eq!(out.status.code(), Some(0));

    let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
    for phrase in [
        "production-ready",
        "stable plugin abi is supported",
        "stable plugin abi is available",
        "mcp ready",
        "stable mcp interface",
        "kv260 inference works",
        "20 tok/s achieved",
        "timing closure achieved",
        "timing-closed bitstream is available",
    ] {
        assert!(
            !text.contains(phrase),
            "workflow proposals contain unsupported claim: {phrase}"
        );
    }
}

#[test]
fn workflow_proposal_keys_match_example_json() {
    use std::path::Path;

    let example_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("docs/examples/workflow-proposals.example.json");

    let example_text = std::fs::read_to_string(&example_path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", example_path.display()));
    let example: serde_json::Value =
        serde_json::from_str(&example_text).expect("workflow proposal example JSON is not valid");

    let example_keys: HashSet<&str> = example
        .as_object()
        .expect("workflow proposal example JSON must be an object")
        .keys()
        .map(String::as_str)
        .collect();

    let live = proposals_json();
    let live_keys: HashSet<&str> = live
        .as_object()
        .expect("workflow proposal stdout must be an object")
        .keys()
        .map(String::as_str)
        .collect();

    assert_eq!(
        live_keys,
        example_keys,
        "live workflow proposal keys differ from example JSON.\n  live only: {:?}\n  example only: {:?}",
        live_keys.difference(&example_keys).collect::<Vec<_>>(),
        example_keys.difference(&live_keys).collect::<Vec<_>>(),
    );
}
