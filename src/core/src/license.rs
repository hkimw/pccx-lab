// Module Boundary: core/
// License Manager — edition detection and license token validation.
//
// Architecture:
//  - Community edition: always available, feature-gated APIs return Err.
//  - Enterprise edition: compiled in with `--features enterprise`.
//    A license token (JWT-like structure) is validated at runtime.
//    The secret key must be injected via the `PCCX_LICENSE_SECRET` env var.

/// Returns a human-readable one-line license descriptor.
pub fn get_license_info() -> &'static str {
    #[cfg(feature = "enterprise")]
    {
        "pccx Enterprise — Proprietary License (pccx-core-private)"
    }
    #[cfg(not(feature = "enterprise"))]
    {
        "pccx Community — Apache 2.0 Open Source"
    }
}

/// Returns `true` when the `enterprise` Cargo feature is enabled.
#[inline(always)]
pub fn is_enterprise_enabled() -> bool {
    cfg!(feature = "enterprise")
}

// ─── Token Validation ────────────────────────────────────────────────────────

/// A parsed, validated license token.
#[derive(Debug, Clone)]
pub struct LicenseToken {
    pub licensee: String,
    pub tier: LicenseTier,
    /// Unix timestamp after which the token is invalid (0 = perpetual).
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LicenseTier {
    Community,
    Professional,
    Enterprise,
}

impl std::fmt::Display for LicenseTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Community    => write!(f, "Community"),
            Self::Professional => write!(f, "Professional"),
            Self::Enterprise   => write!(f, "Enterprise"),
        }
    }
}

#[derive(Debug)]
pub enum LicenseError {
    /// Token string is malformed (wrong number of segments).
    MalformedToken,
    /// Signature does not match the expected HMAC.
    InvalidSignature,
    /// Token has passed its expiry timestamp.
    TokenExpired { expired_at: u64 },
    /// The licensee header is not valid UTF-8.
    InvalidEncoding,
}

impl std::fmt::Display for LicenseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MalformedToken          => write!(f, "Malformed license token"),
            Self::InvalidSignature        => write!(f, "Invalid license signature"),
            Self::TokenExpired { expired_at } =>
                write!(f, "License expired at unix time {}", expired_at),
            Self::InvalidEncoding         => write!(f, "Invalid token encoding"),
        }
    }
}

/// Validates a `<licensee>.<tier>.<expires_at>.<signature>` license token.
///
/// The signature is a FNV-1a 64-bit hash of `<licensee>.<tier>.<expires_at>`
/// XOR'd with a secret derived from the `PCCX_LICENSE_SECRET` environment
/// variable.  This is a lightweight scheme suitable for offline validation;
/// for production, replace with HMAC-SHA256.
pub fn validate_token(token: &str) -> Result<LicenseToken, LicenseError> {
    let parts: Vec<&str> = token.splitn(4, '.').collect();
    if parts.len() != 4 {
        return Err(LicenseError::MalformedToken);
    }

    let licensee  = parts[0];
    let tier_str  = parts[1];
    let exp_str   = parts[2];
    let sig_str   = parts[3];

    // Parse expiry
    let expires_at: u64 = exp_str.parse().map_err(|_| LicenseError::MalformedToken)?;

    // Parse tier
    let tier = match tier_str {
        "community"    => LicenseTier::Community,
        "professional" => LicenseTier::Professional,
        "enterprise"   => LicenseTier::Enterprise,
        _              => return Err(LicenseError::MalformedToken),
    };

    // Reconstruct payload for signature check
    let payload = format!("{}.{}.{}", licensee, tier_str, exp_str);

    // Derive secret key (env var or hard-coded dev fallback)
    let secret = std::env::var("PCCX_LICENSE_SECRET")
        .unwrap_or_else(|_| "pccx-dev-secret-key".to_string());

    let expected_sig = token_sign(payload.as_bytes(), secret.as_bytes());
    let expected_hex = format!("{:016x}", expected_sig);

    if sig_str != expected_hex {
        return Err(LicenseError::InvalidSignature);
    }

    // Check expiry (0 = perpetual)
    if expires_at != 0 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if now > expires_at {
            return Err(LicenseError::TokenExpired { expired_at: expires_at });
        }
    }

    Ok(LicenseToken {
        licensee: licensee.to_string(),
        tier,
        expires_at,
    })
}

/// Generates a license token string for the given parameters (used by the
/// license issuance tool, not exposed to end users).
pub fn issue_token(licensee: &str, tier: &str, expires_at: u64, secret: &[u8]) -> String {
    let payload = format!("{}.{}.{}", licensee, tier, expires_at);
    let sig = token_sign(payload.as_bytes(), secret);
    format!("{}.{:016x}", payload, sig)
}

/// FNV-1a 64-bit HMAC stub — XORs payload hash with key hash.
fn token_sign(payload: &[u8], key: &[u8]) -> u64 {
    const BASIS: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x00000100000001b3;
    let hash_payload = payload.iter().fold(BASIS, |h, &b| (h ^ b as u64).wrapping_mul(PRIME));
    let hash_key     = key.iter().fold(BASIS, |h, &b| (h ^ b as u64).wrapping_mul(PRIME));
    hash_payload ^ hash_key
}

// ─── Feature-guarded APIs ─────────────────────────────────────────────────────

/// Runs the high-speed enterprise simulation pipeline.
/// Returns `Err` in Community builds to enforce the open-core boundary.
#[cfg(feature = "enterprise")]
pub fn run_high_speed_simulation() -> Result<(), &'static str> {
    // Placeholder: delegates to pccx-core-private crate in real builds.
    Ok(())
}

#[cfg(not(feature = "enterprise"))]
pub fn run_high_speed_simulation() -> Result<(), &'static str> {
    Err("High-speed simulation requires an Enterprise license. \
         Recompile with --features enterprise or contact sales.")
}
