use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub(crate) struct AppState {
    auth_token: RwLock<Option<(String, DateTime<Utc>)>>,
    registration_key: RwLock<Option<String>>,
    cancellation_tokens: DashMap<usize, CancellationToken>,
    current_otp: RwLock<Option<(String, DateTime<Utc>)>>,
}

impl AppState {
    pub(crate) fn new() -> Self {
        Self {
            auth_token: RwLock::new(None),
            registration_key: RwLock::new(None),
            cancellation_tokens: DashMap::new(),
            current_otp: RwLock::new(None),
        }
    }

    pub(crate) fn remove_cancellation_token(
        &self,
        req_id: usize,
    ) -> Option<(usize, CancellationToken)> {
        self.cancellation_tokens.remove(&req_id)
    }

    pub(crate) fn add_cancellation_token(
        &self,
        req_id: usize,
        cancellation_tokens: CancellationToken,
    ) {
        self.cancellation_tokens
            .insert(req_id, cancellation_tokens.clone());
    }

    pub(crate) fn set_otp(&self, otp: String, expiry: DateTime<Utc>) {
        let mut current_otp = self.current_otp.write().unwrap();
        *current_otp = Some((otp, expiry));
    }

    pub(crate) fn validate_otp(&self, otp: &str) -> bool {
        let current_otp = self.current_otp.read().unwrap();
        if let Some((stored_otp, expiry)) = &*current_otp {
            *stored_otp == otp && Utc::now() < *expiry
        } else {
            false
        }
    }

    pub(crate) fn set_auth_token(
        &self,
        token: String,
        expiry: DateTime<Utc>,
    ) -> Option<(String, DateTime<Utc>)> {
        let mut auth_token = self.auth_token.write().unwrap();
        *auth_token = Some((token, expiry));
        auth_token.clone()
    }

    pub(crate) fn validate_auth_token(&self, token: &str) -> bool {
        let auth_token = self.auth_token.read().unwrap();
        if let Some((stored_token, expiry)) = &*auth_token {
            stored_token == token && Utc::now() < *expiry
        } else {
            false
        }
    }

    pub(crate) fn validate_registration_key(&self, reg_key: String) -> bool {
        self.registration_key.read().unwrap().as_ref() != Some(&reg_key)
    }

    pub(crate) fn clear_auth_token(&self) {
        let mut auth_token = self.auth_token.write().unwrap();
        *auth_token = None;
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct RegistrationKey {
    pub(crate) reg_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct KeyValuePair {
    pub(crate) key: String,
    pub(crate) value: String,
}

pub(crate) enum ReqBodyAction {
    Body(reqwest::Body),
    UrlEncodedForm(Vec<(String, String)>),
    MultipartForm(reqwest::multipart::Form),
}

#[derive(Debug, Deserialize)]
pub(crate) enum FormDataValue {
    Text(String),
    File {
        filename: String,
        data: Vec<u8>,
        mime: String,
    },
}

#[derive(Debug, Deserialize)]
pub(crate) struct FormDataEntry {
    pub(crate) key: String,
    pub(crate) value: FormDataValue,
}

#[derive(Debug, Deserialize)]
pub(crate) enum BodyDef {
    Text(String),
    URLEncoded(Vec<KeyValuePair>),
    FormData(Vec<FormDataEntry>),
}

#[derive(Debug, Deserialize)]
pub(crate) struct RequestDef {
    pub(crate) req_id: usize,
    pub(crate) method: String,
    pub(crate) endpoint: String,
    pub(crate) parameters: Vec<KeyValuePair>,
    pub(crate) headers: Vec<KeyValuePair>,
    pub(crate) body: Option<BodyDef>,
    pub(crate) validate_certs: bool,
    pub(crate) root_cert_bundle_files: Vec<Vec<u8>>,
    pub(crate) client_cert: Option<ClientCertDef>,
}

#[derive(Debug, Deserialize)]
pub(crate) enum ClientCertDef {
    PEMCert {
        certificate_pem: Vec<u8>,
        key_pem: Vec<u8>,
    },
    PFXCert {
        certificate_pfx: Vec<u8>,
        password: String,
    },
}

#[derive(Debug, Serialize)]
pub(crate) struct RunRequestResponse {
    pub(crate) status: u16,
    pub(crate) status_text: String,
    pub(crate) headers: Vec<KeyValuePair>,
    pub(crate) data: Vec<u8>,
    pub(crate) time_start_ms: u128,
    pub(crate) time_end_ms: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) enum RunRequestError {
    InternalError,
    Unauthorized,
    RequestCancelled,
    ClientCertError,
    RootCertError,
    InvalidMethod,
    InvalidUrl,
    InvalidHeaders,
    RequestRunError(String),
}

impl warp::reject::Reject for RunRequestError {}
