//! Four-key TraceNet identity model (TRACENET2.md §1):
//!   - `transport_key`: iroh EndpointId (QUIC wire identity, rotatable)
//!   - `author_key`: persistent Ed25519 reputation & crystal authorship
//!   - `human_key`: mandatory human export-consent authority
//!   - `solana_key`: settlement address (anchored via signed Pkarr record)

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use iroh::{PublicKey, SecretKey, Signature};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const B58_ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn b58_encode(bytes: &[u8]) -> String {
    let mut digits: Vec<u8> = vec![0];
    for &byte in bytes {
        let mut carry = byte as u32;
        for d in digits.iter_mut() {
            carry += (*d as u32) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut out = String::new();
    for &b in bytes {
        if b == 0 {
            out.push('1');
        } else {
            break;
        }
    }
    for &d in digits.iter().rev() {
        if out.is_empty() && d == 0 && digits.len() > 1 {
            continue;
        }
        out.push(B58_ALPHABET[d as usize] as char);
    }
    if out.is_empty() {
        out.push('1');
    }
    out
}

pub fn b58_decode(s: &str) -> Result<Vec<u8>> {
    if s.is_empty() {
        return Err(anyhow!("empty base58 string"));
    }
    let mut bytes: Vec<u8> = vec![0];
    for ch in s.bytes() {
        let val = B58_ALPHABET
            .iter()
            .position(|&c| c == ch)
            .ok_or_else(|| anyhow!("invalid base58 char"))? as u32;
        let mut carry = val;
        for b in bytes.iter_mut() {
            carry += (*b as u32) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            bytes.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let leading_zeros = s.bytes().take_while(|&c| c == b'1').count();
    let mut out = vec![0u8; leading_zeros];
    // Trim highest zero byte if added only by initial [0]
    while bytes.len() > 1 && *bytes.last().unwrap() == 0 {
        bytes.pop();
    }
    if bytes.len() == 1 && bytes[0] == 0 && leading_zeros > 0 {
        return Ok(out);
    }
    bytes.reverse();
    out.extend_from_slice(&bytes);
    Ok(out)
}

pub fn pubkey_b58(pk: &PublicKey) -> String {
    b58_encode(pk.as_bytes())
}

pub fn parse_pubkey_b58(s: &str) -> Result<PublicKey> {
    let raw = b58_decode(s)?;
    let arr: [u8; 32] = raw
        .try_into()
        .map_err(|_| anyhow!("base58 pubkey must decode to 32 bytes"))?;
    PublicKey::from_bytes(&arr).map_err(|e| anyhow!("invalid ed25519 pubkey: {e}"))
}

/// Canonical JSON serialization: lexicographically sorted object keys, no whitespace.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => serde_json::to_string(s).unwrap(),
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap(), canonical_json(&map[k])))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

pub fn blake3_hex(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

pub fn sign_digest(secret: &SecretKey, message: &[u8]) -> String {
    let digest = blake3::hash(message);
    let sig = secret.sign(digest.as_bytes());
    hex::encode(sig.to_bytes())
}

pub fn verify_digest(pk: &PublicKey, message: &[u8], sig_hex: &str) -> Result<()> {
    let sig_bytes = hex::decode(sig_hex).context("invalid signature hex")?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| anyhow!("signature must be 64 bytes"))?;
    let sig = Signature::from_bytes(&sig_arr);
    let digest = blake3::hash(message);
    pk.verify(digest.as_bytes(), &sig)
        .map_err(|e| anyhow!("signature verification failed: {e}"))
}

pub fn now_unix_s() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkarrRecord {
    pub v: u32,
    pub author: String,
    pub solana: String,
    pub relay: String,
    pub caps: Vec<String>,
    pub ts: u64,
    pub signature: String,
}

impl PkarrRecord {
    pub fn verify(&self) -> Result<()> {
        let pk = parse_pubkey_b58(&self.author)?;
        let mut val = serde_json::to_value(self)?;
        val.as_object_mut().unwrap().remove("signature");
        let preimage = canonical_json(&val);
        verify_digest(&pk, preimage.as_bytes(), &self.signature)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredIdentity {
    transport_seed_hex: String,
    author_seed_hex: String,
    human_seed_hex: String,
    solana_seed_hex: String,
}

#[derive(Clone)]
pub struct NodeIdentity {
    pub transport: SecretKey,
    pub author: SecretKey,
    pub human: SecretKey,
    pub solana: SecretKey,
}

impl NodeIdentity {
    pub fn generate() -> Self {
        let mut rng = rand_seed();
        let transport = SecretKey::from_bytes(&rng());
        let author = SecretKey::from_bytes(&rng());
        let human = SecretKey::from_bytes(&rng());
        let solana = SecretKey::from_bytes(&rng());
        Self {
            transport,
            author,
            human,
            solana,
        }
    }

    pub fn author_b58(&self) -> String {
        pubkey_b58(&self.author.public())
    }

    pub fn human_b58(&self) -> String {
        pubkey_b58(&self.human.public())
    }

    pub fn solana_b58(&self) -> String {
        pubkey_b58(&self.solana.public())
    }

    pub fn transport_id(&self) -> String {
        self.transport.public().to_string()
    }

    pub fn signed_pkarr(&self, relay: &str) -> Result<PkarrRecord> {
        let mut rec = PkarrRecord {
            v: 1,
            author: self.author_b58(),
            solana: self.solana_b58(),
            relay: relay.to_string(),
            caps: vec!["crystal/v1".into(), "packet/v1".into(), "trace/v1".into()],
            ts: now_unix_s(),
            signature: String::new(),
        };
        let mut val = serde_json::to_value(&rec)?;
        val.as_object_mut().unwrap().remove("signature");
        let preimage = canonical_json(&val);
        rec.signature = sign_digest(&self.author, preimage.as_bytes());
        Ok(rec)
    }

    pub fn save(&self, dir: &Path) -> Result<()> {
        fs::create_dir_all(dir)?;
        let stored = StoredIdentity {
            transport_seed_hex: hex::encode(self.transport.to_bytes()),
            author_seed_hex: hex::encode(self.author.to_bytes()),
            human_seed_hex: hex::encode(self.human.to_bytes()),
            solana_seed_hex: hex::encode(self.solana.to_bytes()),
        };
        let path = dir.join("identity.json");
        let bytes = serde_json::to_vec_pretty(&stored)?;
        fs::write(&path, bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }

    pub fn load(dir: &Path) -> Result<Self> {
        let path = dir.join("identity.json");
        let raw = fs::read(&path).with_context(|| format!("missing identity at {}", path.display()))?;
        let s: StoredIdentity = serde_json::from_slice(&raw)?;
        let parse = |h: &str| -> Result<SecretKey> {
            let b = hex::decode(h)?;
            let arr: [u8; 32] = b.try_into().map_err(|_| anyhow!("seed must be 32 bytes"))?;
            Ok(SecretKey::from_bytes(&arr))
        };
        Ok(Self {
            transport: parse(&s.transport_seed_hex)?,
            author: parse(&s.author_seed_hex)?,
            human: parse(&s.human_seed_hex)?,
            solana: parse(&s.solana_seed_hex)?,
        })
    }
}

fn rand_seed() -> impl FnMut() -> [u8; 32] {
    let mut counter: u64 = 0;
    move || {
        counter += 1;
        let mut seed = [0u8; 32];
        // Read OS entropy from /dev/urandom on Unix, mixed with BLAKE3 + monotonic counter.
        let mut h = blake3::Hasher::new();
        if let Ok(mut f) = fs::File::open("/dev/urandom") {
            use std::io::Read;
            let mut buf = [0u8; 32];
            if f.read_exact(&mut buf).is_ok() {
                h.update(&buf);
            }
        }
        h.update(&counter.to_le_bytes());
        h.update(&now_unix_s().to_le_bytes());
        seed.copy_from_slice(h.finalize().as_bytes());
        seed
    }
}
