use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};

/// Describes one registered app instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registration {
    pub registered_at: DateTime<Utc>,

    /// base16 (lowercase) encoded shared secret that the client
    /// and agent established during registration that is used
    /// to encrypt traffic between them
    pub shared_secret_b16: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Registrations {
    pub registrations: DashMap<String, Registration>,
}

/// Single instance payload.
#[derive(Clone, Serialize)]
pub struct Payload {
    args: Vec<String>,
    cwd: String,
}

impl Payload {
    pub fn new(args: Vec<String>, cwd: String) -> Self {
        Self { args, cwd }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HandshakeResponse {
    #[allow(non_snake_case)]
    pub __hoppscotch__agent__: bool,

    pub status: String,
    pub agent_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfirmedRegistrationRequest {
    pub registration: String,

    /// base16 (lowercase) encoded public key shared by the client
    /// to the agent so that the agent can establish a shared secret
    /// which will be used to encrypt traffic between agent
    /// and client after registration
    pub client_public_key_b16: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthKeyResponse {
    pub auth_key: String,
    pub created_at: DateTime<Utc>,

    /// base16 (lowercase) encoded public key shared by the
    /// agent so that the client can establish a shared secret
    /// which will be used to encrypt traffic between agent
    /// and client after registration
    pub agent_public_key_b16: String,
}
