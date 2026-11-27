//! TraceNet object schemas & canonical BLAKE3 / dual-Ed25519 verification (TRACENET2.md §2, §4, §5).

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};

use crate::keys::{
    blake3_hex, canonical_json, now_unix_s, parse_pubkey_b58, sign_digest, verify_digest,
    NodeIdentity,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeProof {
    #[serde(rename = "type")]
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Efficiency {
    pub tokens: u64,
    pub latency_ms: u64,
    pub tool_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Compatibility {
    pub model_family: String,
    pub min_context_k: u32,
    pub required_tools: Vec<String>,
    pub env_constraints: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanConsent {
    pub policy: String, // "local" | "share-private" | "share-public"
    pub human_key: String,
    pub signed_at: u64,
    pub human_signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrystalV1 {
    pub schema: String,
    pub domain_tags: Vec<String>,
    pub task_fingerprint: String,
    pub approach: String,
    pub outcome_proof: OutcomeProof,
    pub efficiency: Efficiency,
    pub compatibility: Compatibility,
    pub privacy: String,
    pub pii_cleared: bool,
    pub secrets_cleared: bool,
    pub canary_recall: f64,
    pub source_traces: Vec<String>,
    pub human_consent: HumanConsent,
    pub author: String,
    pub ts: u64,
    pub signature: String,
}

impl CrystalV1 {
    /// Build and dual-sign a shareable crystal:
    /// 1. `human_key` signs the consent payload (fail-closed if policy == "local").
    /// 2. `author_key` signs the entire crystal payload.
    pub fn create_signed(
        id: &NodeIdentity,
        domain_tags: Vec<String>,
        task_fingerprint: String,
        approach: String,
        outcome_proof: OutcomeProof,
        canary_recall: f64,
        policy: &str,
    ) -> Result<Self> {
        let ts = now_unix_s();
        let mut crystal = Self {
            schema: "tracenet/crystal/v1".into(),
            domain_tags,
            task_fingerprint,
            approach,
            outcome_proof,
            efficiency: Efficiency {
                tokens: 0,
                latency_ms: 0,
                tool_cost_usd: 0.0,
            },
            compatibility: Compatibility {
                model_family: "*".into(),
                min_context_k: 32,
                required_tools: vec![],
                env_constraints: "*".into(),
            },
            privacy: if policy == "share-public" {
                "public".into()
            } else if policy == "share-private" {
                "org".into()
            } else {
                "local".into()
            },
            pii_cleared: true,
            secrets_cleared: true,
            canary_recall,
            source_traces: vec![],
            human_consent: HumanConsent {
                policy: policy.into(),
                human_key: id.human_b58(),
                signed_at: ts,
                human_signature: None,
            },
            author: id.author_b58(),
            ts,
            signature: String::new(),
        };

        if policy != "local" {
            let consent_preimage = crystal.consent_preimage()?;
            crystal.human_consent.human_signature =
                Some(sign_digest(&id.human, consent_preimage.as_bytes()));
        }

        let author_preimage = crystal.author_preimage()?;
        crystal.signature = sign_digest(&id.author, author_preimage.as_bytes());
        Ok(crystal)
    }

    fn consent_preimage(&self) -> Result<String> {
        let payload = serde_json::json!({
            "schema": self.schema,
            "task_fingerprint": self.task_fingerprint,
            "approach_hash": blake3_hex(self.approach.as_bytes()),
            "policy": self.human_consent.policy,
            "human_key": self.human_consent.human_key,
            "signed_at": self.human_consent.signed_at,
            "author": self.author,
        });
        Ok(canonical_json(&payload))
    }

    fn author_preimage(&self) -> Result<String> {
        let mut val = serde_json::to_value(self)?;
        val.as_object_mut()
            .ok_or_else(|| anyhow!("crystal not object"))?
            .remove("signature");
        Ok(canonical_json(&val))
    }

    /// Permanent content address: BLAKE3(canonical_json(crystal)).
    pub fn canonical_bytes(&self) -> Result<Vec<u8>> {
        let val = serde_json::to_value(self)?;
        Ok(canonical_json(&val).into_bytes())
    }

    pub fn blake3_address(&self) -> Result<String> {
        Ok(blake3_hex(&self.canonical_bytes()?))
    }

    /// Fail-closed verification required before sending OR accepting over the wire.
    pub fn verify_shareable(&self) -> Result<()> {
        if self.schema != "tracenet/crystal/v1" {
            bail!("unsupported schema: {}", self.schema);
        }
        if self.human_consent.policy == "local" || self.human_consent.policy == "no-share" {
            bail!("consent policy '{}' forbids network export", self.human_consent.policy);
        }
        if !self.pii_cleared || !self.secrets_cleared {
            bail!("crystal has not cleared privacy membrane");
        }
        let human_sig = self
            .human_consent
            .human_signature
            .as_deref()
            .ok_or_else(|| anyhow!("missing human consent signature"))?;
        let human_pk = parse_pubkey_b58(&self.human_consent.human_key)?;
        verify_digest(&human_pk, self.consent_preimage()?.as_bytes(), human_sig)?;

        let author_pk = parse_pubkey_b58(&self.author)?;
        verify_digest(&author_pk, self.author_preimage()?.as_bytes(), &self.signature)?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrystalAnnounce {
    #[serde(rename = "type")]
    pub kind: String,
    pub hash: String,
    pub blob_hash: String,
    pub author: String,
    pub transport_id: String,
    pub domain_tags: Vec<String>,
    pub task_fingerprint: String,
    pub size_bytes: u64,
    pub ts: u64,
    pub signature: String,
}

impl CrystalAnnounce {
    pub fn sign_new(
        id: &NodeIdentity,
        crystal: &CrystalV1,
        blob_hash: String,
        size_bytes: u64,
    ) -> Result<Self> {
        let mut msg = Self {
            kind: "crystal_announce".into(),
            hash: crystal.blake3_address()?,
            blob_hash,
            author: id.author_b58(),
            transport_id: id.transport_id(),
            domain_tags: crystal.domain_tags.clone(),
            task_fingerprint: crystal.task_fingerprint.clone(),
            size_bytes,
            ts: now_unix_s(),
            signature: String::new(),
        };
        let mut val = serde_json::to_value(&msg)?;
        val.as_object_mut().unwrap().remove("signature");
        msg.signature = sign_digest(&id.author, canonical_json(&val).as_bytes());
        Ok(msg)
    }

    pub fn verify(&self) -> Result<()> {
        let pk = parse_pubkey_b58(&self.author)?;
        let mut val = serde_json::to_value(self)?;
        val.as_object_mut().unwrap().remove("signature");
        verify_digest(&pk, canonical_json(&val).as_bytes(), &self.signature)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HandshakeMsg {
    #[serde(rename = "introduce")]
    Introduce {
        v: u32,
        author: String,
        transport_id: String,
        share_ratio: f64,
        ts: u64,
        nonce: String,
        signature: String,
    },
    #[serde(rename = "introduce_ack")]
    IntroduceAck {
        v: u32,
        author: String,
        transport_id: String,
        share_ratio: f64,
        accepted: bool,
        reject_reason: Option<String>,
        ts: u64,
        nonce: String,
        signature: String,
    },
    #[serde(rename = "request_crystal")]
    RequestCrystal { crystal_hash: String },
    #[serde(rename = "offer")]
    Offer {
        crystal_hash: String,
        blob_hash: String,
        size_bytes: u64,
    },
    #[serde(rename = "decline")]
    Decline {
        crystal_hash: String,
        reason: String,
    },
    #[serde(rename = "receipt")]
    Receipt {
        crystal_hash: String,
        verified: bool,
        ts: u64,
        author: String,
        signature: String,
    },
}

impl HandshakeMsg {
    pub fn sign_introduce(id: &NodeIdentity, share_ratio: f64, nonce: String) -> Result<Self> {
        let ts = now_unix_s();
        let pre = canonical_json(&serde_json::json!({
            "type": "introduce", "v": 1, "author": id.author_b58(),
            "transport_id": id.transport_id(), "ts": ts, "nonce": nonce
        }));
        Ok(Self::Introduce {
            v: 1,
            author: id.author_b58(),
            transport_id: id.transport_id(),
            share_ratio,
            ts,
            nonce,
            signature: sign_digest(&id.author, pre.as_bytes()),
        })
    }

    pub fn sign_receipt(id: &NodeIdentity, crystal_hash: String, verified: bool) -> Result<Self> {
        let ts = now_unix_s();
        let pre = canonical_json(&serde_json::json!({
            "type": "receipt", "crystal_hash": crystal_hash,
            "verified": verified, "ts": ts, "author": id.author_b58()
        }));
        Ok(Self::Receipt {
            crystal_hash,
            verified,
            ts,
            author: id.author_b58(),
            signature: sign_digest(&id.author, pre.as_bytes()),
        })
    }
}
