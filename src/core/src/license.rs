// pccx-lab is Apache License 2.0.  This file used to carry a
// tiered-license token validator; it was deleted along with all
// paid-feature gating.  The two helpers below are the minimum the
// status bar + legacy callers still expect.

pub fn get_license_info() -> &'static str {
    "pccx-lab — Apache License 2.0"
}

/// No gating left in the codebase; this is a type-level stub for any
/// caller that still references the old high-speed sim entry point.
pub fn run_high_speed_simulation() -> Result<(), &'static str> {
    Ok(())
}
